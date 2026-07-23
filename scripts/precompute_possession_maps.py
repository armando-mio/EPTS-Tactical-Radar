import os
import glob
import json
import re

def slugify(text):
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    return re.sub(r'[\s_-]+', '_', text)

def normalize_point(x, y, attack_direction, pitch_len=105.0, pitch_width=68.0):
    if attack_direction == "rtl":
        return round(pitch_len - x, 2), round(pitch_width - y, 2)
    return round(x, 2), round(y, 2)

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.abspath(os.path.join(base_dir, "..", "radar-app", "public", "data"))
    
    map_files = glob.glob(os.path.join(data_dir, "clip_*_map.json"))
    print(f"Data dir: {data_dir}")
    print(f"Found {len(map_files)} clip map files to process.")

    # Group clips by (code, team)
    grouped_clips = {}

    for filepath in map_files:
        with open(filepath, 'r') as f:
            data = json.load(f)

        clip_info = data.get('clip_info', {})
        code = clip_info.get('code', 'UNKNOWN')
        team = clip_info.get('team', 'N/A')

        key = (code, team)
        if key not in grouped_clips:
            grouped_clips[key] = []
        
        grouped_clips[key].append(data)

    index_manifest = []

    for (code, team), clips in grouped_clips.items():
        if team == 'N/A':
            continue

        normalized_progressions = []
        normalized_passes = []

        total_progressions = 0
        total_passes = 0

        for clip_data in clips:
            clip_info = clip_data['clip_info']
            direction = clip_info.get('attack_direction', 'ltr')
            clip_id = clip_info.get('code_id')

            # Normalize progressions
            for prog in clip_data.get('progressions', []):
                if prog.get('team') and prog['team'] != team:
                    continue

                raw_pts = prog['points']
                norm_pts = [
                    list(normalize_point(pt[0], pt[1], direction))
                    for pt in raw_pts
                ]
                normalized_progressions.append({
                    'clip_id': clip_id,
                    'player_id': prog['player_id'],
                    'team': prog['team'],
                    'points': norm_pts,
                    'distance_m': prog.get('distance_m', 0.0)
                })
                total_progressions += 1

            # Normalize passes
            for p in clip_data.get('passes', []):
                if p.get('team') and p['team'] != team:
                    continue

                sx, sy = normalize_point(p['start_x'], p['start_y'], direction)
                ex, ey = normalize_point(p['end_x'], p['end_y'], direction)

                normalized_passes.append({
                    'clip_id': clip_id,
                    'from_player': p.get('from_player'),
                    'to_player': p.get('to_player'),
                    'start': [sx, sy],
                    'end': [ex, ey],
                    'distance_m': p.get('distance_m', 0.0)
                })
                total_passes += 1

        code_slug = slugify(code)
        team_slug = slugify(team)
        filename = f"possession_map_{code_slug}_{team_slug}.json"
        out_filepath = os.path.join(data_dir, filename)

        summary_json = {
            'action_type': code,
            'team': team,
            'instances_count': len(clips),
            'total_progressions': total_progressions,
            'total_passes': total_passes,
            'normalized_attack_direction': 'Left to Right (LTR)',
            'progressions': normalized_progressions,
            'passes': normalized_passes
        }

        with open(out_filepath, 'w') as f:
            json.dump(summary_json, f, indent=2)

        index_manifest.append({
            'action_type': code,
            'team': team,
            'filename': filename,
            'instances_count': len(clips),
            'total_progressions': total_progressions,
            'total_passes': total_passes
        })

    index_filepath = os.path.join(data_dir, "possession_maps_index.json")
    with open(index_filepath, 'w') as f:
        json.dump(index_manifest, f, indent=2)

    print(f"Precomputed {len(index_manifest)} possession sequence maps (by action_type & team).")
    print(f"Manifest written to {index_filepath}.")

if __name__ == "__main__":
    main()
