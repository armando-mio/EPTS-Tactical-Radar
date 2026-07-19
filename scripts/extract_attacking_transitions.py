import os
import gc
import pandas as pd
import numpy as np
from kloppy import metrica, sportscode

def load_tracking_data(meta_data_path, raw_data_path):
    """
    Load tracking data using Kloppy and convert to a Pandas DataFrame.
    """
    print(f"Loading tracking data from:\n  Metadata: {meta_data_path}\n  Raw Data: {raw_data_path}...")
    
    # Load Metrica tracking data
    dataset = metrica.load_tracking_epts(
        meta_data=meta_data_path,
        raw_data=raw_data_path
    )
    
    # Extract metadata objects
    metadata = dataset.metadata
    
    # Convert to DataFrame
    df = dataset.to_df()
    print(f"Tracking data loaded successfully. Shape: {df.shape}")
    
    # Explicitly delete the dataset object to free memory
    del dataset
    gc.collect()
    
    return df, metadata

def load_event_data(event_data_path):
    """
    Load Sportscode event XML data using Kloppy and convert to a Pandas DataFrame.
    """
    print(f"Loading event data from: {event_data_path}...")
    dataset = sportscode.load(data=event_data_path)
    df = dataset.to_df()
    print(f"Event data loaded successfully. Shape: {df.shape}")
    
    # Free memory
    del dataset
    gc.collect()
    
    return df

def extract_event_tracking(tracking_df, event_df, team_name, event_code):
    """
    Find event time windows and extract corresponding tracking rows.
    """
    print(f"Filtering events for Team: '{team_name}' and Event Code: '{event_code}'...")
    
    # Filter the events matching the team and event code
    filtered_events = event_df[
        (event_df['code'] == event_code) & 
        (event_df['Team'] == team_name)
    ]
    print(f"Found {len(filtered_events)} events matching the criteria.")
    
    # Initialize a boolean mask on the tracking DataFrame
    mask = pd.Series(False, index=tracking_df.index)
    
    # Map event time windows onto tracking DataFrame
    for idx, event in filtered_events.iterrows():
        start = event['timestamp']
        end = event['end_timestamp']
        event_mask = (tracking_df['timestamp'] >= start) & (tracking_df['timestamp'] <= end)
        mask |= event_mask
        
    extracted_df = tracking_df[mask].copy()
    print(f"Extracted {len(extracted_df)} tracking rows falling within the event windows.")
    return extracted_df, filtered_events

def main():
    # Paths to the dataset files
    base_dir = os.path.dirname(os.path.abspath(__file__))
    meta_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_FifaData.xml")
    raw_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_FifaDataRawData.txt")
    event_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_pattern.xml")
    
    # 1. Load data
    tracking_df, metadata = load_tracking_data(meta_data_path, raw_data_path)
    event_df = load_event_data(event_data_path)
    
    # Define criteria
    team_name = "Red Team"
    event_code = "ATTACKING TRANSITION"
    
    # 2. Extract coordinate rows
    extracted_df, filtered_events = extract_event_tracking(
        tracking_df, event_df, team_name, event_code
    )
    
    # Get Red Team player IDs from metadata to construct filtered columns
    red_team = [team for team in metadata.teams if team.name == team_name][0]
    red_player_ids = [player.player_id for player in red_team.players]
    print(f"Red Team Player IDs: {red_player_ids}")
    
    # 3. Select columns of interest (coordinates and speeds of Red Team and Ball)
    columns_to_keep = [
        'period_id', 'timestamp', 'frame_id', 'ball_state', 'ball_owning_team_id',
        'ball_x', 'ball_y', 'ball_speed'
    ]
    for p_id in red_player_ids:
        # Add player coordinate, speed and distance columns if they exist in the tracking DataFrame
        for col_suffix in ['_x', '_y', '_s']:
            col_name = f"{p_id}{col_suffix}"
            if col_name in tracking_df.columns:
                columns_to_keep.append(col_name)
                
    extracted_red_team_df = extracted_df[columns_to_keep].copy()
    
    # Save output
    output_path = os.path.join(base_dir, "..", "data", "red_attacking_transitions_tracking.csv")
    print(f"Saving extracted coordinates to: {output_path}...")
    extracted_red_team_df.to_csv(output_path, index=False)
    
    print("\nExtraction complete! Preview of the first 5 rows of the extracted DataFrame:")
    print(extracted_red_team_df.head())
    
    # Clean up tracking_df to release large blocks of memory
    del tracking_df
    del extracted_df
    gc.collect()

if __name__ == "__main__":
    main()
