# Metrica EPTS Tactical Radar Visualizer

An advanced sports analytics and tactical visualization platform that synchronizes Metrica Sports automatic tracking telemetry (ATD) and Sportscode tactical events onto a high-performance interactive 2D radar web application, complete with a synchronized broadcast video player.

---

## 📈 Data Acquisition from Metrica Nexus

The data assets used in this repository were sourced from the **Metrica Sports / Metrica Nexus** ecosystem using the following workflow:

1. **Video Ingestion & Processing**: The full-match raw broadcast video (`DEMO_1001_FULLMATCH.mp4`) was uploaded to the Metrica Cloud. The platform's automated computer vision algorithms (field calibration, object detection, and tracking) processed the footage frame-by-frame.
2. **Automatic Tracking Data (ATD) Generation**: Because manual player identification was not performed, the AI engine computed camera-compensated telemetry based on *tracks*. It assigns a track number to each player on screen and extracts their continuous $(X, Y)$ normalized coordinates, instantaneous speed, and the ball's coordinates.
3. **FIFA EPTS Export**: The telemetry and session metadata are exported in the standardized **FIFA EPTS (Electronic Performance and Tracking Systems)** XML/TXT formats:
   * **`DEMO_1001_FULLMATCH_FifaData.xml` (Metadata)**: Defines the pitch size ($105 \times 68$ meters), frame rate ($25.0$ FPS), kickoff details, team assignments, and tracking configurations.
   * **`DEMO_1001_FULLMATCH_FifaDataRawData.txt` (Telemetry)**: A tab-separated file containing the raw normalized $(0.0 - 1.0)$ coordinates, speeds, and status for all active tracks and the ball.
4. **Sportscode Event Tagging**: Analysts tagged tactical match phases in Sportscode, exporting an XML event file (`DEMO_1001_FULLMATCH_pattern.xml`) containing start and end times for tactical periods such as *Build Up*, *Progression*, and *Attacking Transitions*.

---

## 🐍 Data Science Pipeline (Scripts)

To process these large telemetry datasets on standard hardware (e.g. 8GB RAM), the scripts in `scripts/` are optimized to convert tracking datasets to Pandas DataFrames and release memory buffers immediately:

* **[extract_attacking_transitions.py](file:///c:/Users/Dakkarm/Desktop/EPTS-Tactical-Radar/scripts/extract_attacking_transitions.py)**: Filters the 145,967 tracking rows down to the 10,728 frames associated with the Red Team's `ATTACKING TRANSITION` events.
* **[calculate_metrics.py](file:///c:/Users/Dakkarm/Desktop/EPTS-Tactical-Radar/scripts/calculate_metrics.py)**: Calculates cumulative distances covered in meters (calculating jumps between valid frames), player average speeds, and team tactical metrics like **centroids** (center of mass) and **dispersion** (average distance of players to the centroid).
* **[detect_passes.py](file:///c:/Users/Dakkarm/Desktop/EPTS-Tactical-Radar/scripts/detect_passes.py)**: A geometric heuristic checking player-ball coordinates. It flags player touches when a player is within 1.2m of the ball and classifies successful passes when possession transfers between players on the same team, recording start/end frames and spatial coordinates.
* **[prepare_radar_data.py](file:///c:/Users/Dakkarm/Desktop/EPTS-Tactical-Radar/scripts/prepare_radar_data.py)**: Gathers tracking telemetry, metrics, and passes, then splits them into chunked, lightweight JSON files per clip (approx. 100KB each) inside the React static folder. This avoids loading a single large file, keeping browser memory <150MB.

---

## 💻 Web App Setup & Installation

The interactive tactical visualizer is a modern dashboard built in **Vite + React** using **HTML5 Canvas** for fluid 25 FPS animations.

### Prerequisites
* **Node.js** (v18 or higher)
* **npm** (v10 or higher)

### Setup & Run
1. Navigate to the client folder and install dependencies:
   ```bash
   cd radar-app
   npm install
   ```
2. Start the local server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:5173/](http://localhost:5173/) in your web browser.

### 🎥 Broadcast Video Streaming & Seek Sync
To stream the 2.3 GB broadcast video directly from the local folder, the Vite configuration ([vite.config.js](file:///c:/Users/Dakkarm/Desktop/EPTS-Tactical-Radar/radar-app/vite.config.js)) includes custom dev server middleware that implements **HTTP Range Requests**. 

This allows the browser's video element to seek, scrub, and stream tiny chunks of the video instantly in real-time, syncing the video player's `currentTime` directly with the timeline frame indices of the 2D radar visualizer without buffering or lag.