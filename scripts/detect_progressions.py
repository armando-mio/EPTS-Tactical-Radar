import os
import gc
import json
import pandas as pd
import numpy as np
from kloppy import metrica, sportscode

def load_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    meta_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_FifaData.xml")
    raw_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_FifaDataRawData.txt")
    event_data_path = os.path.join(base_dir, "..", "data", "DEMO_1001_FULLMATCH_pattern.xml")

    print("Loading tracking data...")
    dataset = metrica.load_tracking_epts(meta_data=meta_data_path, raw_data=raw_data_path)
    metadata = dataset.metadata
    tracking_df = dataset.to_df()
    del dataset
    gc.collect()

    print("Loading event data...")
    event_dataset = sportscode.load(data=event_data_path)
    event_df = event_dataset.to_df()
    del event_dataset
    gc.collect()

    return tracking_df, event_df, metadata

def detect_player_touches(tracking_df, player_ids, pitch_length, pitch_width, dist_threshold=1.5):
    ball_x = tracking_df['ball_x'].values * pitch_length
    ball_y = tracking_df['ball_y'].values * pitch_width
    timestamps = tracking_df['timestamp'].values
    frame_ids = tracking_df['frame_id'].values

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
    touches = []

    for t in range(num_frames):
        bx, by = ball_x[t], ball_y[t]
        if np.isnan(bx) or np.isnan(by):
            continue

        closest_player = None
        min_dist = float('inf')

        for p_id, (px, py) in player_coords.items():
            px_t, py_t = px[t], py[t]
            if np.isnan(px_t) or np.isnan(py_t):
                continue
            dist = np.hypot(px_t - bx, py_t - by)
            if dist < min_dist:
                min_dist = dist
                closest_player = p_id

        if min_dist < dist_threshold and closest_player is not None:
            p_num = int(closest_player)
            team_name = "Red Team" if p_num <= 20 else "White Team"
            touches.append({
                'index': t,
                'frame_id': int(frame_ids[t]),
                'timestamp_sec': float(pd.to_timedelta(timestamps[t]).total_seconds()),
                'player_id': str(closest_player),
                'team': team_name,
                'ball_x': float(bx),
                'ball_y': float(by)
            })

    return touches

def group_touches_into_possessions(touches):
    if not touches:
        return []

    possessions = []
    curr = {
        'player_id': touches[0]['player_id'],
        'team': touches[0]['team'],
        'start_frame_idx': touches[0]['index'],
        'end_frame_idx': touches[0]['index'],
        'start_frame_id': touches[0]['frame_id'],
        'end_frame_id': touches[0]['frame_id'],
        'start_time': touches[0]['timestamp_sec'],
        'end_time': touches[0]['timestamp_sec'],
    }

    for touch in touches[1:]:
        if touch['player_id'] == curr['player_id'] and (touch['index'] - curr['end_frame_idx'] <= 5):
            curr['end_frame_idx'] = touch['index']
            curr['end_frame_id'] = touch['frame_id']
            curr['end_time'] = touch['timestamp_sec']
        else:
            possessions.append(curr)
            curr = {
                'player_id': touch['player_id'],
                'team': touch['team'],
                'start_frame_idx': touch['index'],
                'end_frame_idx': touch['index'],
                'start_frame_id': touch['frame_id'],
                'end_frame_id': touch['frame_id'],
                'start_time': touch['timestamp_sec'],
                'end_time': touch['timestamp_sec'],
            }

    possessions.append(curr)
    return possessions

def extract_progressions_from_possessions(possessions, tracking_df, pitch_length, pitch_width):
    ball_x = tracking_df['ball_x'].values * pitch_length
    ball_y = tracking_df['ball_y'].values * pitch_width
    period_ids = tracking_df['period_id'].values if 'period_id' in tracking_df.columns else np.ones(len(tracking_df))

    progressions = []

    for pos in possessions:
        s_idx = pos['start_frame_idx']
        e_idx = pos['end_frame_idx']

        # Must have at least 3 frames of continuous possession
        if (e_idx - s_idx) < 2:
            continue

        bx_slice = ball_x[s_idx : e_idx + 1]
        by_slice = ball_y[s_idx : e_idx + 1]

        points = []
        for x, y in zip(bx_slice, by_slice):
            if not (np.isnan(x) or np.isnan(y)):
                points.append([round(float(x), 2), round(float(y), 2)])

        if len(points) < 3:
            continue

        dist = np.hypot(points[-1][0] - points[0][0], points[-1][1] - points[0][1])

        # Require > 0.5m progression distance
        if dist >= 0.5:
            progressions.append({
                'player_id': pos['player_id'],
                'team': pos['team'],
                'period_id': int(period_ids[s_idx]),
                'start_frame': pos['start_frame_id'],
                'end_frame': pos['end_frame_id'],
                'start_time': pos['start_time'],
                'end_time': pos['end_time'],
                'distance_m': round(float(dist), 2),
                'points': points
            })

    return progressions

def determine_attack_direction(team_name, period_id):
    if team_name == "Red Team":
        return "ltr" if period_id == 1 else "rtl"
    elif team_name == "White Team":
        return "rtl" if period_id == 1 else "ltr"
    return "ltr"

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dest_data_dir = os.path.abspath(os.path.join(base_dir, "..", "radar-app", "public", "data"))
    os.makedirs(dest_data_dir, exist_ok=True)
    print(f"Output directory: {dest_data_dir}")

    tracking_df, event_df, metadata = load_data()
    pitch_length = getattr(metadata.pitch_dimensions, 'pitch_length', 105.0)
    pitch_width = getattr(metadata.pitch_dimensions, 'pitch_width', 68.0)

    all_player_ids = [p.player_id for team in metadata.teams for p in team.players]

    print("Detecting player touches...")
    touches = detect_player_touches(tracking_df, all_player_ids, pitch_length, pitch_width)

    print("Grouping touches into possession phases...")
    possessions = group_touches_into_possessions(touches)

    print("Extracting ball progression polylines...")
    all_progressions = extract_progressions_from_possessions(possessions, tracking_df, pitch_length, pitch_width)
    print(f"Extracted {len(all_progressions)} valid progression segments.")

    progressions_out_path = os.path.join(base_dir, "..", "data", "detected_progressions.json")
    with open(progressions_out_path, 'w') as f:
        json.dump(all_progressions, f, indent=2)

    passes_path = os.path.join(base_dir, "..", "data", "detected_passes.json")
    all_passes = json.load(open(passes_path)) if os.path.exists(passes_path) else []

    print("Building per-instance map JSON files for Vite web app...")
    event_df['Team'] = event_df['Team'].fillna('N/A')

    created_count = 0
    for idx, event in event_df.iterrows():
        code_id = int(event['code_id'])
        code = str(event['code'])
        team_name = str(event['Team'])
        start_sec = float(event['timestamp'].total_seconds())
        end_sec = float(event['end_timestamp'].total_seconds())
        duration = end_sec - start_sec

        clip_df = tracking_df[
            (tracking_df['timestamp'] >= event['timestamp']) &
            (tracking_df['timestamp'] <= event['end_timestamp'])
        ]
        if clip_df.empty:
            continue

        period_id = int(clip_df['period_id'].iloc[0]) if 'period_id' in clip_df.columns else 1
        attack_direction = determine_attack_direction(team_name, period_id)

        clip_progressions = [
            p for p in all_progressions
            if start_sec <= p['start_time'] <= end_sec
        ]

        clip_passes = [
            p for p in all_passes
            if start_sec <= p['start_time'] <= end_sec
        ]

        instance_map_json = {
            'clip_info': {
                'code_id': code_id,
                'code': code,
                'team': team_name,
                'start_time_sec': start_sec,
                'end_time_sec': end_sec,
                'duration_sec': duration,
                'period_id': period_id,
                'attack_direction': attack_direction
            },
            'progressions': clip_progressions,
            'passes': clip_passes
        }

        out_file = os.path.join(dest_data_dir, f"clip_{code_id}_map.json")
        with open(out_file, 'w') as f:
            json.dump(instance_map_json, f, indent=2)

        created_count += 1

    print(f"Per-instance static map generation complete! Created {created_count} clip map files in {dest_data_dir}.")

if __name__ == "__main__":
    main()
