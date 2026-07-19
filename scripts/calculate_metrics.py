import os
import gc
import pandas as pd
import numpy as np
from kloppy import metrica, sportscode

def load_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    meta_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_FifaData.xml")
    raw_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_FifaDataRawData.txt")
    event_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_pattern.xml")

    # Load Metrica tracking data
    print("Loading tracking data...")
    dataset = metrica.load_tracking_epts(meta_data=meta_data_path, raw_data=raw_data_path)
    metadata = dataset.metadata
    tracking_df = dataset.to_df()
    del dataset
    gc.collect()

    # Load Sportscode event data
    print("Loading event data...")
    event_dataset = sportscode.load(data=event_data_path)
    event_df = event_dataset.to_df()
    del event_dataset
    gc.collect()

    return tracking_df, event_df, metadata

def calculate_cumulative_distances(tracking_df, player_ids, pitch_length, pitch_width):
    """
    Calculate the cumulative distance covered (in meters) for each player.
    We compute Euclidean distance between consecutive valid frames.
    """
    distances = {}
    for p_id in player_ids:
        x_col = f"{p_id}_x"
        y_col = f"{p_id}_y"
        if x_col not in tracking_df.columns or y_col not in tracking_df.columns:
            continue
        
        # Get coordinates in meters
        x = tracking_df[x_col].values * pitch_length
        y = tracking_df[y_col].values * pitch_width
        
        # Calculate differences between consecutive elements
        dx = np.diff(x)
        dy = np.diff(y)
        
        # Euclidean distance
        step_distances = np.sqrt(dx**2 + dy**2)
        
        # Filter out steps where either start or end frame is NaN
        # np.diff propagates NaNs, so we just check where step_distances is NaN
        step_distances = np.nan_to_num(step_distances, nan=0.0)
        
        # We also want to handle cases of extreme telemetry jumps (e.g. player teleportation / tracking reset)
        # Typically a player cannot run faster than 12 m/s (43.2 km/h). At 25fps, max step is 12 / 25 = 0.48 meters.
        # Let's set a conservative threshold of 1.5 meters per frame to filter out tracking jumps
        step_distances[step_distances > 1.5] = 0.0
        
        distances[p_id] = np.sum(step_distances)
        
    return distances

def calculate_centroid_and_dispersion(tracking_df, player_ids, pitch_length, pitch_width):
    """
    Calculate the centroid and dispersion (mean distance to centroid) for each frame in tracking_df.
    Returns:
        centroid_x: array of x coordinates of centroid
        centroid_y: array of y coordinates of centroid
        dispersion: array of average distance to centroid per frame
    """
    x_cols = [f"{p_id}_x" for p_id in player_ids if f"{p_id}_x" in tracking_df.columns]
    y_cols = [f"{p_id}_y" for p_id in player_ids if f"{p_id}_y" in tracking_df.columns]
    
    # Extract coordinate matrices in meters
    x_matrix = tracking_df[x_cols].values * pitch_length
    y_matrix = tracking_df[y_cols].values * pitch_width
    
    # Calculate row-wise (frame-wise) mean ignoring NaNs
    centroid_x = np.nanmean(x_matrix, axis=1)
    centroid_y = np.nanmean(y_matrix, axis=1)
    
    # Calculate distance of each active player to the centroid
    # (x_matrix - centroid_x[:, None]) computes the difference
    dx = x_matrix - centroid_x[:, None]
    dy = y_matrix - centroid_y[:, None]
    distances_to_centroid = np.sqrt(dx**2 + dy**2)
    
    # Dispersion is the average distance to centroid per frame (ignoring NaNs)
    dispersion = np.nanmean(distances_to_centroid, axis=1)
    
    return centroid_x, centroid_y, dispersion

def analyze_transitions(tracking_df, event_df, player_ids, pitch_length, pitch_width):
    """
    Calculate transition metrics: cumulative distance, average speeds, centroid and dispersion during transitions.
    """
    # Filter Red Team's ATTACKING TRANSITION events
    transitions = event_df[
        (event_df['code'] == 'ATTACKING TRANSITION') & 
        (event_df['Team'] == 'Red Team')
    ].copy()
    
    transition_results = []
    
    for idx, event in transitions.iterrows():
        start = event['timestamp']
        end = event['end_timestamp']
        duration = (end - start).total_seconds()
        
        # Filter tracking data for this transition window
        transition_df = tracking_df[
            (tracking_df['timestamp'] >= start) & 
            (tracking_df['timestamp'] <= end)
        ]
        
        if transition_df.empty:
            continue
            
        # 1. Cumulative distances during this transition
        t_distances = calculate_cumulative_distances(transition_df, player_ids, pitch_length, pitch_width)
        total_dist = sum(t_distances.values())
        
        # 2. Speeds (converting from m/s to km/h)
        player_speeds = {}
        for p_id in player_ids:
            s_col = f"{p_id}_s"
            if s_col in transition_df.columns:
                speeds = transition_df[s_col].dropna().values
                if len(speeds) > 0:
                    # Convert m/s to km/h
                    player_speeds[p_id] = np.mean(speeds) * 3.6
        
        avg_team_speed = np.mean(list(player_speeds.values())) if player_speeds else 0.0
        max_player_speed = np.max(list(player_speeds.values())) if player_speeds else 0.0
        
        # 3. Centroid and dispersion
        cx, cy, disp = calculate_centroid_and_dispersion(transition_df, player_ids, pitch_length, pitch_width)
        avg_dispersion = np.nanmean(disp) if not np.all(np.isnan(disp)) else 0.0
        
        transition_results.append({
            'transition_id': idx + 1,
            'start_time_sec': start.total_seconds(),
            'end_time_sec': end.total_seconds(),
            'duration_sec': duration,
            'total_distance_m': total_dist,
            'avg_team_speed_kmh': avg_team_speed,
            'max_speed_kmh': max_player_speed,
            'avg_dispersion_m': avg_dispersion
        })
        
    return pd.DataFrame(transition_results)

def main():
    tracking_df, event_df, metadata = load_data()
    
    # Extract pitch dimensions (defaults to 105 x 68 if not set)
    pitch_length = getattr(metadata.pitch_dimensions, 'pitch_length', 105.0)
    pitch_width = getattr(metadata.pitch_dimensions, 'pitch_width', 68.0)
    print(f"Pitch dimensions: {pitch_length}m x {pitch_width}m")
    
    # Identify Red Team players
    red_team = [team for team in metadata.teams if team.name == "Red Team"][0]
    red_player_ids = [player.player_id for player in red_team.players]
    
    # --- 1. Entire Match Metrics ---
    print("\n--- Computing Entire Match Metrics ---")
    full_match_distances = calculate_cumulative_distances(tracking_df, red_player_ids, pitch_length, pitch_width)
    
    # Create player summary DataFrame
    player_summary = []
    for p_id in red_player_ids:
        # Calculate average speed over entire match
        s_col = f"{p_id}_s"
        avg_speed_kmh = 0.0
        if s_col in tracking_df.columns:
            speeds = tracking_df[s_col].dropna().values
            if len(speeds) > 0:
                avg_speed_kmh = np.mean(speeds) * 3.6
                
        player_summary.append({
            'player_id': p_id,
            'player_name': f"Player {p_id}",
            'total_distance_meters': full_match_distances.get(p_id, 0.0),
            'avg_speed_kmh': avg_speed_kmh
        })
    player_summary_df = pd.DataFrame(player_summary).sort_values(by='total_distance_meters', ascending=False)
    
    print("\nRed Team Full Match Physical Performance Summary:")
    print(player_summary_df.to_string(index=False))
    
    # --- 2. Attacking Transition Metrics ---
    print("\n--- Computing Attacking Transition Metrics ---")
    transition_metrics_df = analyze_transitions(tracking_df, event_df, red_player_ids, pitch_length, pitch_width)
    
    print("\nAttacking Transitions Summary (First 10 events):")
    print(transition_metrics_df.head(10).to_string(index=False))
    
    # Save the output files
    base_dir = os.path.dirname(os.path.abspath(__file__))
    player_summary_df.to_csv(os.path.join(base_dir, "..", "data", "red_team_full_match_physical_summary.csv"), index=False)
    transition_metrics_df.to_csv(os.path.join(base_dir, "..", "data", "red_team_attacking_transitions_summary.csv"), index=False)
    print("\nMetrics calculated successfully! CSV files saved in 'data/' directory.")

if __name__ == "__main__":
    main()
