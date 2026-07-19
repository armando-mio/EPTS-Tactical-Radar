import os
import gc
import json
import pandas as pd
import numpy as np
from kloppy import metrica, sportscode

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    meta_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_FifaData.xml")
    raw_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_FifaDataRawData.txt")
    event_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_pattern.xml")
    
    # Destination directory in Vite React project
    dest_data_dir = os.path.join(base_dir, "..", "radar-app", "public", "data")
    os.makedirs(dest_data_dir, exist_ok=True)
    
    # Load Metrica tracking data
    print("Loading Metrica tracking data...")
    dataset = metrica.load_tracking_epts(meta_data=meta_data_path, raw_data=raw_data_path)
    metadata = dataset.metadata
    tracking_df = dataset.to_df()
    del dataset
    gc.collect()
    
    # Load Sportscode event data
    print("Loading Sportscode event data...")
    event_dataset = sportscode.load(data=event_data_path)
    event_df = event_dataset.to_df()
    del event_dataset
    gc.collect()
    
    # Load passes
    passes_path = os.path.join(base_dir, "..", "data", "detected_passes.json")
    if os.path.exists(passes_path):
        with open(passes_path, 'r') as f:
            all_passes = json.load(f)
    else:
        all_passes = []
    
    # Copy full match physical summaries
    summary_path = os.path.join(base_dir, "..", "data", "red_team_full_match_physical_summary.csv")
    if os.path.exists(summary_path):
        summary_df = pd.read_csv(summary_path)
        summary_json = summary_df.to_dict(orient='records')
        with open(os.path.join(dest_data_dir, "full_match_physical_summary.json"), 'w') as f:
            json.dump(summary_json, f, indent=2)
            
    # Pitch Dimensions
    pitch_length = getattr(metadata.pitch_dimensions, 'pitch_length', 105.0)
    pitch_width = getattr(metadata.pitch_dimensions, 'pitch_width', 68.0)
    print(f"Pitch Dimensions for webapp: {pitch_length}x{pitch_width}")
    
    # Identify teams and player metadata
    teams_metadata = []
    player_id_to_team = {}
    for team in metadata.teams:
        team_players = []
        for player in team.players:
            player_id_to_team[player.player_id] = team.name
            team_players.append({
                'id': player.player_id,
                'name': player.name,
                'shirt_number': player.jersey_no
            })
        teams_metadata.append({
            'team_name': team.name,
            'ground': str(team.ground),
            'players': team_players
        })
        
    with open(os.path.join(dest_data_dir, "teams_metadata.json"), 'w') as f:
        json.dump(teams_metadata, f, indent=2)
        
    # Get all events from the event dataset
    events_summary = []
    
    # Clean and fill NaNs in event_df
    event_df['Team'] = event_df['Team'].fillna('N/A')
    
    print(f"Processing all {len(event_df)} events...")
    
    # Process each event clip
    for idx, event in event_df.iterrows():
        code_id = int(event['code_id'])
        code = event['code']
        team_name = event['Team']
        start = event['timestamp']
        end = event['end_timestamp']
        duration = (end - start).total_seconds()
        start_sec = start.total_seconds()
        end_sec = end.total_seconds()
        
        # Filter tracking data for this event window
        clip_df = tracking_df[
            (tracking_df['timestamp'] >= start) & 
            (tracking_df['timestamp'] <= end)
        ]
        
        if clip_df.empty:
            continue
            
        # Extract frames
        frames = []
        for _, row in clip_df.iterrows():
            frame_data = {
                'frame_id': int(row['frame_id']),
                'timestamp_sec': pd.to_timedelta(row['timestamp']).total_seconds(),
                'ball': {
                    'x': float(row['ball_x'] * pitch_length) if not pd.isna(row['ball_x']) else None,
                    'y': float(row['ball_y'] * pitch_width) if not pd.isna(row['ball_y']) else None,
                    'speed': float(row['ball_speed']) if not pd.isna(row['ball_speed']) else 0.0
                },
                'players': []
            }
            
            # Add all active players
            for p_id, p_team_name in player_id_to_team.items():
                x_col = f"{p_id}_x"
                y_col = f"{p_id}_y"
                s_col = f"{p_id}_s"
                
                if x_col in row and y_col in row:
                    px = row[x_col]
                    py = row[y_col]
                    if not pd.isna(px) and not pd.isna(py):
                        ps = row[s_col] if s_col in row and not pd.isna(row[s_col]) else 0.0
                        frame_data['players'].append({
                            'id': p_id,
                            'team': p_team_name,
                            'x': float(px * pitch_length),
                            'y': float(py * pitch_width),
                            's': float(ps * 3.6) # Convert to km/h for dashboard consistency
                        })
            frames.append(frame_data)
            
        # Filter passes during this transition
        clip_passes = [
            p for p in all_passes 
            if start_sec <= p['start_time'] <= end_sec
        ]
        
        # Calculate summary metrics for this event
        # Centroid and dispersion of Red Team (always useful as metrics reference)
        dispersions = []
        for f in frames:
            red_players = [p for p in f['players'] if p['team'] == 'Red Team']
            if red_players:
                cx = np.mean([p['x'] for p in red_players])
                cy = np.mean([p['y'] for p in red_players])
                disp = np.mean([np.sqrt((p['x'] - cx)**2 + (p['y'] - cy)**2) for p in red_players])
                dispersions.append(disp)
                
        avg_dispersion = float(np.mean(dispersions)) if dispersions else 0.0
        
        # Team speed of Red Team
        speeds = []
        for f in frames:
            red_players = [p for p in f['players'] if p['team'] == 'Red Team']
            if red_players:
                speeds.extend([p['s'] for p in red_players])
        avg_speed = float(np.mean(speeds)) if speeds else 0.0
        max_speed = float(np.max(speeds)) if speeds else 0.0
        
        clip_summary = {
            'code_id': int(code_id),
            'code': str(code),
            'team': str(team_name),
            'start_time_sec': float(start_sec),
            'end_time_sec': float(end_sec),
            'duration_sec': float(duration),
            'passes_count': len(clip_passes),
            'avg_team_speed_kmh': avg_speed,
            'max_speed_kmh': max_speed,
            'avg_dispersion_m': avg_dispersion
        }
        events_summary.append(clip_summary)
        
        # Save detailed clip data to JSON
        clip_json = {
            'clip_info': clip_summary,
            'frames': frames,
            'passes': clip_passes
        }
        
        with open(os.path.join(dest_data_dir, f"clip_{code_id}.json"), 'w') as f:
            json.dump(clip_json, f, indent=2)
            
    # Save events summary
    with open(os.path.join(dest_data_dir, "attacking_transitions_summary.json"), 'w') as f:
        json.dump(events_summary, f, indent=2)
        
    print(f"Data preparation complete! Created {len(events_summary)} clip files in {dest_data_dir}.")

if __name__ == "__main__":
    main()
