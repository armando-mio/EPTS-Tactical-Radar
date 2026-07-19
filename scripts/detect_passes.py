import os
import gc
import json
import pandas as pd
import numpy as np
from kloppy import metrica

def load_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    meta_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_FifaData.xml")
    raw_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_FifaDataRawData.txt")

    print("Loading tracking data...")
    dataset = metrica.load_tracking_epts(meta_data=meta_data_path, raw_data=raw_data_path)
    metadata = dataset.metadata
    tracking_df = dataset.to_df()
    del dataset
    gc.collect()

    return tracking_df, metadata

def detect_player_touches(tracking_df, player_ids, pitch_length, pitch_width, dist_threshold=1.5):
    """
    For each frame, identify if any player is close to the ball (distance < dist_threshold meters).
    Returns list of touches: (frame_id, timestamp, player_id, team_name, x, y)
    """
    touches = []
    
    # Pre-extract numpy coordinates for performance
    ball_x = tracking_df['ball_x'].values * pitch_length
    ball_y = tracking_df['ball_y'].values * pitch_width
    timestamps = tracking_df['timestamp'].values
    frame_ids = tracking_df['frame_id'].values
    
    # Store player coords in dict for quick access
    player_coords = {}
    for p_id in player_ids:
        x_col = f"{p_id}_x"
        y_col = f"{p_id}_y"
        if x_col in tracking_df.columns and y_col in tracking_df.columns:
            player_coords[p_id] = (
                tracking_df[x_col].values * pitch_length,
                tracking_df[y_col].values * pitch_width
            )
            
    num_frames = len(tracking_df)
    
    for t in range(num_frames):
        bx, by = ball_x[t], ball_y[t]
        if np.isnan(bx) or np.isnan(by):
            continue
            
        closest_player = None
        min_dist = float('inf')
        
        # Find closest player to the ball in this frame
        for p_id, (px, py) in player_coords.items():
            px_t, py_t = px[t], py[t]
            if np.isnan(px_t) or np.isnan(py_t):
                continue
                
            dist = np.sqrt((px_t - bx)**2 + (py_t - by)**2)
            if dist < min_dist:
                min_dist = dist
                closest_player = p_id
                
        # If closest player is within threshold, record a touch
        if min_dist < dist_threshold and closest_player is not None:
            # Determine team (Red is 1-20, White is 21-40)
            p_num = int(closest_player)
            team_name = "Red Team" if p_num <= 20 else "White Team"
            
            touches.append({
                'index': t,
                'frame_id': int(frame_ids[t]),
                'timestamp_sec': pd.to_timedelta(timestamps[t]).total_seconds(),
                'player_id': closest_player,
                'team': team_name,
                'ball_x': float(bx),
                'ball_y': float(by)
            })
            
    return touches

def group_touches_into_possessions(touches):
    """
    Compress consecutive touches by the same player into possession periods.
    """
    if not touches:
        return []
        
    possessions = []
    current_possession = {
        'player_id': touches[0]['player_id'],
        'team': touches[0]['team'],
        'start_frame_idx': touches[0]['index'],
        'end_frame_idx': touches[0]['index'],
        'start_time': touches[0]['timestamp_sec'],
        'end_time': touches[0]['timestamp_sec'],
        'start_x': touches[0]['ball_x'],
        'start_y': touches[0]['ball_y'],
        'end_x': touches[0]['ball_x'],
        'end_y': touches[0]['ball_y']
    }
    
    for touch in touches[1:]:
        # If it's the same player and consecutive frame (or within 5 frames / 0.2s of overlap)
        if touch['player_id'] == current_possession['player_id'] and (touch['index'] - current_possession['end_frame_idx'] <= 5):
            current_possession['end_frame_idx'] = touch['index']
            current_possession['end_time'] = touch['timestamp_sec']
            current_possession['end_x'] = touch['ball_x']
            current_possession['end_y'] = touch['ball_y']
        else:
            # Save possession and start new one
            possessions.append(current_possession)
            current_possession = {
                'player_id': touch['player_id'],
                'team': touch['team'],
                'start_frame_idx': touch['index'],
                'end_frame_idx': touch['index'],
                'start_time': touch['timestamp_sec'],
                'end_time': touch['timestamp_sec'],
                'start_x': touch['ball_x'],
                'start_y': touch['ball_y'],
                'end_x': touch['ball_x'],
                'end_y': touch['ball_y']
            }
            
    possessions.append(current_possession)
    return possessions

def detect_passes_from_possessions(possessions):
    """
    Detect successful passes where possession moves from Player A to Player B of the same team,
    within a reasonable travel time (e.g. 0.2s to 4.0s) and distance (e.g. > 3.0 meters).
    """
    passes = []
    for i in range(len(possessions) - 1):
        p1 = possessions[i]
        p2 = possessions[i+1]
        
        # Must be same team but different players
        if p1['team'] == p2['team'] and p1['player_id'] != p2['player_id']:
            travel_time = p2['start_time'] - p1['end_time']
            
            # Constraints for a valid pass
            # Travel time should be between 0.15s and 4.0s
            # Distance between start and end should be > 2.0 meters
            dist = np.sqrt((p2['start_x'] - p1['end_x'])**2 + (p2['start_y'] - p1['end_y'])**2)
            
            if 0.15 <= travel_time <= 4.0 and dist > 2.0:
                passes.append({
                    'pass_id': len(passes) + 1,
                    'team': p1['team'],
                    'from_player': p1['player_id'],
                    'to_player': p2['player_id'],
                    'start_time': p1['end_time'],
                    'end_time': p2['start_time'],
                    'start_frame_idx': p1['end_frame_idx'],
                    'end_frame_idx': p2['start_frame_idx'],
                    'start_x': p1['end_x'],
                    'start_y': p1['end_y'],
                    'end_x': p2['start_x'],
                    'end_y': p2['start_y'],
                    'distance_m': float(dist),
                    'travel_time_sec': float(travel_time)
                })
                
    return passes

def main():
    tracking_df, metadata = load_data()
    
    pitch_length = getattr(metadata.pitch_dimensions, 'pitch_length', 105.0)
    pitch_width = getattr(metadata.pitch_dimensions, 'pitch_width', 68.0)
    
    # Get all player IDs (Red + White)
    all_player_ids = []
    for team in metadata.teams:
        for player in team.players:
            all_player_ids.append(player.player_id)
            
    print("Detecting player touches...")
    touches = detect_player_touches(tracking_df, all_player_ids, pitch_length, pitch_width)
    print(f"Found {len(touches)} touch points in match.")
    
    print("Grouping touches into possession phases...")
    possessions = group_touches_into_possessions(touches)
    print(f"Found {len(possessions)} possession phases.")
    
    print("Detecting successful passes...")
    passes = detect_passes_from_possessions(possessions)
    print(f"Found {len(passes)} successful passes in the match.")
    
    # Save passes to JSON
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(base_dir, "..", "data", "detected_passes.json")
    with open(output_path, 'w') as f:
        json.dump(passes, f, indent=2)
        
    print(f"Saved passes successfully to {output_path}!")
    
    # Let's count passes during Red Team Attacking Transitions
    # We can load the transitions summary
    trans_summary_path = os.path.join(base_dir, "..", "data", "red_team_attacking_transitions_summary.csv")
    if os.path.exists(trans_summary_path):
        trans_df = pd.read_csv(trans_summary_path)
        print("\nPasses during first 5 Attacking Transitions:")
        for idx, row in trans_df.head(5).iterrows():
            t_id = row['transition_id']
            t_start = row['start_time_sec']
            t_end = row['end_time_sec']
            
            t_passes = [p for p in passes if p['team'] == 'Red Team' and t_start <= p['start_time'] <= t_end]
            print(f"Transition {t_id} ({t_start:.1f}s - {t_end:.1f}s): {len(t_passes)} passes detected.")
            for p in t_passes[:3]:
                print(f"  * Pass {p['pass_id']}: Player {p['from_player']} -> Player {p['to_player']} (dist: {p['distance_m']:.1f}m)")

if __name__ == "__main__":
    main()
