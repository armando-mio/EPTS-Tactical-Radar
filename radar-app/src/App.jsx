import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Radio, 
  Camera, 
  Tv,
  Activity,
  Zap,
  Sliders,
  GripVertical,
  Layers,
  Shield
} from 'lucide-react';
import './App.css';
import PerInstanceStaticMapCard from './components/PerInstanceStaticMapCard';
import PossessionSequenceMapModal from './components/PossessionSequenceMapModal';

function App() {
  const [clips, setClips] = useState([]);
  const [activeClipId, setActiveClipId] = useState(null);
  const [clipData, setClipData] = useState(null);
  const [fullMatchSummary, setFullMatchSummary] = useState([]);
  const [teamsMetadata, setTeamsMetadata] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Drag and Drop Grid State
  const [cardsOrder, setCardsOrder] = useState([
    'radar', 
    'video', 
    'static-map', 
    'visual-layers', 
    'physical-perf', 
    'transition-analytics'
  ]);
  const [draggedCardId, setDraggedCardId] = useState(null);
  const [dragOverCardId, setDragOverCardId] = useState(null);

  // Sidebar Filters & View Mode State
  const [selectedTeam, setSelectedTeam] = useState('Red Team');
  const [selectedCategory, setSelectedCategory] = useState('ATTACKING TRANSITION');
  const [sidebarViewMode, setSidebarViewMode] = useState('instances'); // 'instances' | 'possession-maps'
  const [activeModalAction, setActiveModalAction] = useState(null); // null | { category, team }

  // Visual Toggles
  const [showOpponent, setShowOpponent] = useState(true);
  const [showCentroid, setShowCentroid] = useState(false);
  const [showPitchControl, setShowPitchControl] = useState(false);
  const [showPassMap, setShowPassMap] = useState(true);
  const [showDefensiveLine, setShowDefensiveLine] = useState(false);
  const [showMidfieldLine, setShowMidfieldLine] = useState(false);
  const [showAttackingLine, setShowAttackingLine] = useState(false);
  const [showInterLineSpace, setShowInterLineSpace] = useState(false);
  
  // Interactive tooltips / selections
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hoveredPlayer, setHoveredPlayer] = useState(null);
  
  // Drag handle active state (restricts card drag-and-drop strictly to drag handle)
  const [draggableCardId, setDraggableCardId] = useState(null);
  
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const videoRef = useRef(null);
  const lastFrameTimeRef = useRef(0);

  // Group restrictions: Top cards vs Bottom cards
  const getCardGroup = (id) => {
    if (['radar', 'video', 'static-map'].includes(id)) return 'top';
    if (['visual-layers', 'physical-perf', 'transition-analytics'].includes(id)) return 'bottom';
    return null;
  };

  // Drag and Drop event handlers
  const handleDragStart = (e, id) => {
    if (
      e.target.closest('.playback-controls') ||
      e.target.closest('.timeline-slider') ||
      e.target.closest('button') ||
      e.target.closest('input') ||
      e.target.closest('select') ||
      e.target.closest('.switch')
    ) {
      e.preventDefault();
      return;
    }
    setDraggedCardId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (!draggedCardId) return;
    const isSameGroup = getCardGroup(draggedCardId) === getCardGroup(id);
    e.dataTransfer.dropEffect = isSameGroup ? 'move' : 'none';
  };

  const handleDragEnter = (e, id) => {
    e.preventDefault();
    if (!draggedCardId || id === draggedCardId) return;
    const isSameGroup = getCardGroup(draggedCardId) === getCardGroup(id);
    if (isSameGroup) {
      setDragOverCardId(id);
    }
  };

  const handleDragLeave = (e, id) => {
    e.preventDefault();
    if (dragOverCardId === id) {
      setDragOverCardId(null);
    }
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    setDragOverCardId(null);
    if (!draggedCardId || draggedCardId === targetId) return;

    // Enforce group restriction: cards can only swap within the same section (top vs bottom)
    const draggedGroup = getCardGroup(draggedCardId);
    const targetGroup = getCardGroup(targetId);
    if (draggedGroup !== targetGroup) {
      setDraggedCardId(null);
      return;
    }

    setCardsOrder(prevOrder => {
      const newOrder = [...prevOrder];
      const draggedIdx = newOrder.indexOf(draggedCardId);
      const targetIdx = newOrder.indexOf(targetId);
      if (draggedIdx !== -1 && targetIdx !== -1) {
        newOrder[draggedIdx] = targetId;
        newOrder[targetIdx] = draggedCardId;
      }
      return newOrder;
    });
    setDraggedCardId(null);
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setDragOverCardId(null);
  };

  // Load initial summaries and metadata
  useEffect(() => {
    fetch('/data/attacking_transitions_summary.json')
      .then(res => res.json())
      .then(data => {
        setClips(data);
        const defaultClip = data.find(c => c.team === 'Red Team' && c.code === 'ATTACKING TRANSITION');
        if (defaultClip) {
          setActiveClipId(defaultClip.code_id);
        } else if (data.length > 0) {
          setActiveClipId(data[0].code_id);
        }
      })
      .catch(err => console.error("Error loading transition summary:", err));

    fetch('/data/full_match_physical_summary.json')
      .then(res => res.json())
      .then(data => setFullMatchSummary(data))
      .catch(err => console.error("Error loading physical summary:", err));

    fetch('/data/teams_metadata.json')
      .then(res => res.json())
      .then(data => setTeamsMetadata(data))
      .catch(err => console.error("Error loading teams metadata:", err));
  }, []);

  // Get all unique teams and event categories
  const teamsList = Array.from(new Set(clips.map(c => c.team))).filter(Boolean).sort();
  const categoriesList = Array.from(new Set(clips.map(c => c.code))).filter(Boolean).sort();

  // Filter clips based on selection and sort by minute ascending
  const filteredClips = clips
    .filter(c => 
      c.team === selectedTeam && 
      c.code === selectedCategory
    )
    .sort((a, b) => (a.start_time_sec || 0) - (b.start_time_sec || 0));

  // Sync active clip with filters
  useEffect(() => {
    if (filteredClips.length > 0) {
      const alreadyIncluded = filteredClips.some(c => c.code_id === activeClipId);
      if (!alreadyIncluded) {
        setActiveClipId(filteredClips[0].code_id);
      }
    } else {
      setActiveClipId(null);
    }
  }, [selectedTeam, selectedCategory, clips]);

  // Load selected clip tracking details
  useEffect(() => {
    if (!activeClipId) return;
    
    // Stop playback when loading new clip
    setIsPlaying(false);
    setCurrentFrameIdx(0);
    setClipData(null);
    setHoveredPlayer(null);

    fetch(`/data/clip_${activeClipId}.json`)
      .then(res => res.json())
      .then(data => {
        setClipData(data);
      })
      .catch(err => console.error(`Error loading clip ${activeClipId} tracking details:`, err));
  }, [activeClipId]);

  // 1. Playback & Master Video Synchronization Loop
  useEffect(() => {
    if (!isPlaying || !clipData || !clipData.frames || clipData.frames.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      const video = videoRef.current;
      if (video && !video.paused) {
        video.pause();
      }
      return;
    }

    const video = videoRef.current;
    const firstFrameTime = clipData.frames[0].timestamp_sec;
    const startFrameTime = clipData.frames[currentFrameIdx]?.timestamp_sec ?? firstFrameTime;

    // Start video playback if video element is mounted
    if (video) {
      video.playbackRate = playbackSpeed;
      if (Math.abs(video.currentTime - startFrameTime) > 0.3) {
        video.currentTime = startFrameTime;
      }
      video.play().catch(err => console.log("Video playback notice:", err));
    }

    const frameRate = 25; // 25 frames per second in Metrica data
    const intervalMs = 1000 / (frameRate * playbackSpeed);

    const syncLoop = (timestamp) => {
      const vid = videoRef.current;
      
      // If video is mounted and playing, use video.currentTime as the MASTER CLOCK
      if (vid && !vid.paused && vid.readyState >= 2) {
        const vTime = vid.currentTime;
        const elapsedSec = vTime - firstFrameTime;
        const targetIdx = Math.round(elapsedSec * 25);

        if (targetIdx >= clipData.frames.length - 1) {
          vid.pause();
          setIsPlaying(false);
          setCurrentFrameIdx(0);
          vid.currentTime = firstFrameTime;
          return;
        } else if (targetIdx >= 0) {
          setCurrentFrameIdx(targetIdx);
        }
      } else {
        // Fallback: If video is unmounted or paused, drive frame index via timer
        if (!lastFrameTimeRef.current) {
          lastFrameTimeRef.current = timestamp;
        }
        const elapsedMs = timestamp - lastFrameTimeRef.current;
        if (elapsedMs >= intervalMs) {
          setCurrentFrameIdx(prevIdx => {
            if (prevIdx >= clipData.frames.length - 1) {
              setIsPlaying(false);
              return 0;
            }
            return prevIdx + 1;
          });
          lastFrameTimeRef.current = timestamp;
        }
      }

      animationRef.current = requestAnimationFrame(syncLoop);
    };

    animationRef.current = requestAnimationFrame(syncLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      lastFrameTimeRef.current = 0;
    };
  }, [isPlaying, clipData, playbackSpeed]);

  // 2. Sync video position ONLY when PAUSED (user scrubbing slider or resetting)
  useEffect(() => {
    if (isPlaying) return; // Never mutate video.currentTime during active playback!
    const video = videoRef.current;
    if (!video || !clipData || !clipData.frames) return;

    const currentFrame = clipData.frames[currentFrameIdx];
    if (currentFrame && typeof currentFrame.timestamp_sec === 'number') {
      const diff = Math.abs(video.currentTime - currentFrame.timestamp_sec);
      if (diff > 0.05) {
        video.currentTime = currentFrame.timestamp_sec;
      }
    }
  }, [currentFrameIdx, clipData, isPlaying]);

  // 3. Sync video playback rate (speed)
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Canvas drawing effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !clipData) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const margin = 20;

    // Pitch Dimensions in meters
    const pitchLen = 105.0;
    const pitchWidth = 68.0;

    // Scale mapping functions
    const scaleX = (width - 2 * margin) / pitchLen;
    const scaleY = (height - 2 * margin) / pitchWidth;

    const toCanvasX = (mx) => margin + mx * scaleX;
    const toCanvasY = (my) => margin + my * scaleY;
    const toMetersX = (cx) => (cx - margin) / scaleX;
    const toMetersY = (cy) => (cy - margin) / scaleY;

    // 1. Draw Green Pitch Background
    ctx.fillStyle = '#0f111a';
    ctx.fillRect(0, 0, width, height);

    // Dotted grass patterns / pitch grid
    ctx.strokeStyle = 'rgba(38, 41, 56, 0.4)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= pitchLen; x += 105 / 6) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(x), margin);
      ctx.lineTo(toCanvasX(x), height - margin);
      ctx.stroke();
    }

    // 2. Draw Pitch Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;

    // Boundary lines
    ctx.strokeRect(margin, margin, width - 2 * margin, height - 2 * margin);

    // Halfway line
    ctx.beginPath();
    ctx.moveTo(toCanvasX(pitchLen / 2), margin);
    ctx.lineTo(toCanvasX(pitchLen / 2), height - margin);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(toCanvasX(pitchLen / 2), toCanvasY(pitchWidth / 2), 9.15 * scaleX, 0, 2 * Math.PI);
    ctx.stroke();

    // Center spot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(toCanvasX(pitchLen / 2), toCanvasY(pitchWidth / 2), 3, 0, 2 * Math.PI);
    ctx.fill();

    // Penalty areas
    // Left
    ctx.strokeRect(margin, toCanvasY(pitchWidth / 2 - 20.16), 16.5 * scaleX, 40.32 * scaleY);
    ctx.strokeRect(margin, toCanvasY(pitchWidth / 2 - 9.16), 5.5 * scaleX, 18.32 * scaleY);
    // Left penalty spot
    ctx.beginPath();
    ctx.arc(toCanvasX(11.0), toCanvasY(pitchWidth / 2), 3, 0, 2 * Math.PI);
    ctx.fill();
    // Left penalty arc
    ctx.beginPath();
    ctx.arc(toCanvasX(11.0), toCanvasY(pitchWidth / 2), 9.15 * scaleX, -Math.acos(5.5/9.15), Math.acos(5.5/9.15));
    ctx.stroke();

    // Right
    ctx.strokeRect(toCanvasX(pitchLen - 16.5), toCanvasY(pitchWidth / 2 - 20.16), 16.5 * scaleX, 40.32 * scaleY);
    ctx.strokeRect(toCanvasX(pitchLen - 5.5), toCanvasY(pitchWidth / 2 - 9.16), 5.5 * scaleX, 18.32 * scaleY);
    // Right penalty spot
    ctx.beginPath();
    ctx.arc(toCanvasX(pitchLen - 11.0), toCanvasY(pitchWidth / 2), 3, 0, 2 * Math.PI);
    ctx.fill();
    // Right penalty arc
    ctx.beginPath();
    ctx.arc(toCanvasX(pitchLen - 11.0), toCanvasY(pitchWidth / 2), 9.15 * scaleX, Math.PI - Math.acos(5.5/9.15), Math.PI + Math.acos(5.5/9.15));
    ctx.stroke();

    // Goal outlines
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    // Left goal
    ctx.strokeRect(margin - 4, toCanvasY(pitchWidth / 2 - 3.66), 4, 7.32 * scaleY);
    // Right goal
    ctx.strokeRect(width - margin, toCanvasY(pitchWidth / 2 - 3.66), 4, 7.32 * scaleY);

    // Fetch current frame
    const currentFrame = clipData.frames[currentFrameIdx];
    if (!currentFrame) return;

    // Filter active players (if opponent toggle is off, keep only Red Team)
    const activePlayers = currentFrame.players.filter(p => 
      showOpponent || p.team === 'Red Team'
    );

    // 3. Draw Pitch Control (Dynamic Voronoi Grid Overlay)
    if (showPitchControl && activePlayers.length > 0) {
      const gridX = 60;
      const gridY = 40;
      const cellW = (width - 2 * margin) / gridX;
      const cellH = (height - 2 * margin) / gridY;
      
      for (let i = 0; i < gridX; i++) {
        for (let j = 0; j < gridY; j++) {
          const gx = (i + 0.5) * (pitchLen / gridX);
          const gy = (j + 0.5) * (pitchWidth / gridY);
          
          let closestPlayer = null;
          let minDist = Infinity;
          
          for (const player of activePlayers) {
            const dist = Math.hypot(player.x - gx, player.y - gy);
            if (dist < minDist) {
              minDist = dist;
              closestPlayer = player;
            }
          }
          
          if (closestPlayer) {
            ctx.fillStyle = closestPlayer.team === 'Red Team' 
              ? 'rgba(239, 68, 68, 0.13)' 
              : 'rgba(255, 255, 255, 0.08)';
            ctx.fillRect(margin + i * cellW, margin + j * cellH, cellW + 0.5, cellH + 0.5);
          }
        }
      }
    }

    // 5. Draw Pass Map Overlay (glowing vectors showing clip passes)
    if (showPassMap && clipData.passes && clipData.passes.length > 0) {
      clipData.passes.forEach(p => {
        const sx = toCanvasX(p.start_x);
        const sy = toCanvasY(p.start_y);
        const ex = toCanvasX(p.end_x);
        const ey = toCanvasY(p.end_y);

        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);

        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 8 * Math.cos(angle - Math.PI / 6), ey - 8 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ex - 8 * Math.cos(angle + Math.PI / 6), ey - 8 * Math.sin(angle + Math.PI / 6));
        ctx.fill();

        ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // 7. Draw Centroid and Dispersion boundary
    if (showCentroid) {
      const redPlayers = currentFrame.players.filter(p => p.team === 'Red Team');
      if (redPlayers.length > 0) {
        const cx = redPlayers.reduce((sum, p) => sum + p.x, 0) / redPlayers.length;
        const cy = redPlayers.reduce((sum, p) => sum + p.y, 0) / redPlayers.length;
        const ccx = toCanvasX(cx);
        const ccy = toCanvasY(cy);

        // Centroid dispersion connector lines (much more visible)
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 4]);
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 6;
        redPlayers.forEach(p => {
          ctx.beginPath();
          ctx.moveTo(ccx, ccy);
          ctx.lineTo(toCanvasX(p.x), toCanvasY(p.y));
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Dispersion boundary circle
        const distances = redPlayers.map(p => Math.hypot(p.x - cx, p.y - cy));
        const dispersion = distances.reduce((sum, d) => sum + d, 0) / redPlayers.length;

        ctx.save();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 2.0;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(ccx, ccy, dispersion * scaleX, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Centroid center node (Vibrant glowing diamond marker with 'C')
        ctx.save();
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.moveTo(ccx, ccy - 9);
        ctx.lineTo(ccx + 9, ccy);
        ctx.lineTo(ccx, ccy + 9);
        ctx.lineTo(ccx - 9, ccy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#0f111a';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('C', ccx, ccy);
        ctx.restore();
      }
    }

    // 7.5 Draw Tactical Lines (Defensive, Midfield, Attacking) & Player Distances
    const redTeamPlayers = currentFrame.players.filter(p => p.team === 'Red Team');
    
    if (redTeamPlayers.length >= 3 && (showDefensiveLine || showMidfieldLine || showAttackingLine)) {
      const sortedByX = [...redTeamPlayers].sort((a, b) => a.x - b.x);

      let outfield = sortedByX;
      if (sortedByX.length >= 10) {
        outfield = sortedByX.slice(1);
      }

      const totalOutfield = outfield.length;

      const numDef = Math.max(1, Math.round(totalOutfield * 0.38));
      const numAtt = Math.max(1, Math.round(totalOutfield * 0.30));
      const numMid = Math.max(1, totalOutfield - numDef - numAtt);

      const defenders = outfield.slice(0, numDef);
      const midfielders = outfield.slice(numDef, numDef + numMid);
      const attackers = outfield.slice(numDef + numMid);

      const drawTacticalLine = (group, color, labelText, dashPattern = [6, 4]) => {
        if (group.length < 2) return;

        const linePlayers = [...group].sort((a, b) => a.y - b.y);

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash(dashPattern);
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;

        ctx.beginPath();
        linePlayers.forEach((p, idx) => {
          const cx = toCanvasX(p.x);
          const cy = toCanvasY(p.y);
          if (idx === 0) {
            ctx.moveTo(cx, cy);
          } else {
            ctx.lineTo(cx, cy);
          }
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        // Draw distance badges along the line if showInterLineSpace is enabled
        if (showInterLineSpace) {
          for (let i = 0; i < linePlayers.length - 1; i++) {
            const p1 = linePlayers[i];
            const p2 = linePlayers[i + 1];

            const distMeters = Math.hypot(p2.x - p1.x, p2.y - p1.y);

            const cx1 = toCanvasX(p1.x);
            const cy1 = toCanvasY(p1.y);
            const cx2 = toCanvasX(p2.x);
            const cy2 = toCanvasY(p2.y);

            const midX = (cx1 + cx2) / 2;
            const midY = (cy1 + cy2) / 2;

            const badgeText = `${distMeters.toFixed(1)}m`;
            ctx.font = 'bold 9.5px monospace';
            const textMetrics = ctx.measureText(badgeText);
            const padX = 6;
            const badgeW = textMetrics.width + padX * 2;
            const badgeH = 15;

            const bx = midX - badgeW / 2;
            const by = midY - badgeH / 2;

            ctx.fillStyle = 'rgba(10, 12, 20, 0.94)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(bx, by, badgeW, badgeH, 3);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, midX, midY);
          }
        }

        ctx.restore();
      };

      const activeLineGroups = [];
      if (showDefensiveLine && defenders.length >= 2) {
        drawTacticalLine(defenders, '#38bdf8', 'DEF');
        activeLineGroups.push({ name: 'DEF', color: '#38bdf8', players: defenders });
      }
      if (showMidfieldLine && midfielders.length >= 2) {
        drawTacticalLine(midfielders, '#f59e0b', 'MID');
        activeLineGroups.push({ name: 'MID', color: '#f59e0b', players: midfielders });
      }
      if (showAttackingLine && attackers.length >= 2) {
        drawTacticalLine(attackers, '#10b981', 'ATT');
        activeLineGroups.push({ name: 'ATT', color: '#10b981', players: attackers });
      }

      // Draw Inter-Line Space & Dimensions between adjacent active lines
      if (showInterLineSpace && activeLineGroups.length >= 2) {
        for (let g = 0; g < activeLineGroups.length - 1; g++) {
          const g1 = activeLineGroups[g];
          const g2 = activeLineGroups[g + 1];

          const avgX1 = g1.players.reduce((s, p) => s + p.x, 0) / g1.players.length;
          const avgY1 = g1.players.reduce((s, p) => s + p.y, 0) / g1.players.length;
          const avgX2 = g2.players.reduce((s, p) => s + p.x, 0) / g2.players.length;
          const avgY2 = g2.players.reduce((s, p) => s + p.y, 0) / g2.players.length;

          const interLineDist = Math.hypot(avgX2 - avgX1, avgY2 - avgY1);
          const cx1 = toCanvasX(avgX1);
          const cy1 = toCanvasY(avgY1);
          const cx2 = toCanvasX(avgX2);
          const cy2 = toCanvasY(avgY2);

          ctx.save();
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2.0;
          ctx.setLineDash([5, 4]);

          ctx.beginPath();
          ctx.moveTo(cx1, cy1);
          ctx.lineTo(cx2, cy2);
          ctx.stroke();

          const midX = (cx1 + cx2) / 2;
          const midY = (cy1 + cy2) / 2;
          const badgeText = `Space ${g1.name}-${g2.name}: ${interLineDist.toFixed(1)}m`;

          ctx.font = 'bold 9.5px monospace';
          const metrics = ctx.measureText(badgeText);
          const padX = 6;
          const badgeW = metrics.width + padX * 2;
          const badgeH = 16;
          const bx = midX - badgeW / 2;
          const by = midY - badgeH / 2;

          ctx.fillStyle = 'rgba(15, 17, 26, 0.95)';
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.roundRect(bx, by, badgeW, badgeH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f43f5e';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, midX, midY);
          ctx.restore();
        }
      }
    }

    // 8. Draw Player Nodes (Larger, higher contrast & clear jersey numbers)
    activePlayers.forEach(p => {
      const cx = toCanvasX(p.x);
      const cy = toCanvasY(p.y);
      const isRed = p.team === 'Red Team';

      if (isRed) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.30)';
        ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = 'rgba(239, 68, 68, 0.9)';
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 6;
      }

      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = isRed ? '#ffffff' : '#0f172a';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.fillStyle = isRed ? '#ffffff' : '#0f172a';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.id, cx, cy);
    });

    // 9. Draw Ball (Larger & bright yellow)
    const ball = currentFrame.ball;
    if (ball && ball.x !== null && ball.y !== null) {
      const bx = toCanvasX(ball.x);
      const by = toCanvasY(ball.y);

      ctx.fillStyle = '#facc15';
      ctx.shadowColor = 'rgba(250, 204, 21, 0.9)';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(bx, by, 7.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      let closestP = null;
      let minBdist = Infinity;
      activePlayers.forEach(p => {
        const d = Math.hypot(p.x - ball.x, p.y - ball.y);
        if (d < minBdist) {
          minBdist = d;
          closestP = p;
        }
      });

      if (minBdist < 1.5 && closestP) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(toCanvasX(closestP.x), toCanvasY(closestP.y));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

  }, [clipData, currentFrameIdx, showOpponent, showCentroid, showPitchControl, showPassMap, showDefensiveLine, showMidfieldLine, showAttackingLine, showInterLineSpace]);

  // Handle canvas mouse move for interactive tooltips
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    setMousePos({
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    });
  };

  const handlePlayPause = () => {
    setIsPlaying(prev => !prev);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentFrameIdx(0);
  };

  const handleSliderChange = (e) => {
    setCurrentFrameIdx(parseInt(e.target.value));
  };

  const activeClip = clips.find(c => c.code_id === activeClipId);
  const currentFrame = clipData?.frames?.[currentFrameIdx];
  const firstFrameTime = clipData?.frames?.[0]?.timestamp_sec ?? activeClip?.start_time_sec ?? 0;
  
  // currentMatchTimeSec is directly the absolute match timestamp (e.g. 2760s = 46 min)
  const currentMatchTimeSec = Math.max(0, currentFrame?.timestamp_sec ?? activeClip?.start_time_sec ?? 0);
  const currentMatchMin = Math.max(0, Math.floor(currentMatchTimeSec / 60));
  const matchRatio = Math.min(1.0, Math.max(0.01, currentMatchTimeSec / 5400));

  const computedPhysicalSummary = fullMatchSummary.map(row => {
    const distMeters = row.total_distance_meters * matchRatio;
    const distKm = distMeters / 1000;
    
    const framePlayer = currentFrame?.players?.find(p => p.id === String(row.player_id) || p.id === row.player_id);
    let avgSpeedKmh = row.avg_speed_kmh;
    if (framePlayer && typeof framePlayer.s === 'number') {
      avgSpeedKmh = row.avg_speed_kmh * 0.85 + framePlayer.s * 0.15;
    }

    return {
      ...row,
      distKm,
      avgSpeedKmh
    };
  });

  const maxDistKm = Math.max(...computedPhysicalSummary.map(r => r.distKm), 0.1);

  // Helper renderer for individual grid card content
  const renderCardContent = (cardId, isLargeSlot = false) => {
    switch (cardId) {
      case 'radar':
        return (
          <>
            <div className="card-header">
              <span className="card-title">
                <Radio size={16} color="#ef4444" /> TACTICAL RADAR 2D
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GripVertical size={16} className="drag-handle" title="Drag to swap view" onMouseDown={() => setDraggableCardId('radar')} />
              </div>
            </div>

            <div className="canvas-wrapper">
              <canvas 
                ref={canvasRef}
                width={800}
                height={518}
                className="radar-canvas"
              />
            </div>

            {isLargeSlot && renderPlaybackControls()}
          </>
        );

      case 'video':
        return (
          <>
            <div className="card-header">
              <span className="card-title">
                <Tv size={16} color="#3b82f6" /> MATCH VIDEO
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GripVertical size={16} className="drag-handle" title="Drag to swap view" onMouseDown={() => setDraggableCardId('video')} />
              </div>
            </div>
            <div className="video-player-wrapper">
              <video 
                ref={videoRef}
                src="/video/DEMO_1001_FULLMATCH.mp4"
                className="video-player"
                muted
                playsInline
              />
            </div>

            {isLargeSlot && renderPlaybackControls()}
          </>
        );

      case 'static-map':
        return (
          <PerInstanceStaticMapCard 
            activeClipId={activeClipId}
            activeClip={activeClip}
            onHandleMouseDown={() => setDraggableCardId('static-map')}
          />
        );

      case 'visual-layers':
        return (
          <>
            <div className="card-header">
              <span className="card-title">
                <Sliders size={16} color="#3b82f6" /> VISUAL LAYERS
              </span>
              <GripVertical size={16} className="drag-handle" title="Drag to swap view" onMouseDown={() => setDraggableCardId('visual-layers')} />
            </div>
            <div className="toggle-group">
              <div className="toggle-item">
                <span>Opponents (White Team)</span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={showOpponent} 
                    onChange={e => setShowOpponent(e.target.checked)} 
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-item">
                <span>Centroid & Dispersion</span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={showCentroid} 
                    onChange={e => setShowCentroid(e.target.checked)} 
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-item">
                <span>Pitch Control Occupancy</span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={showPitchControl} 
                    onChange={e => setShowPitchControl(e.target.checked)} 
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-item">
                <span>Pass Map Overlay</span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={showPassMap} 
                    onChange={e => setShowPassMap(e.target.checked)} 
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-item">
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>Defensive Line (DEF)</span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={showDefensiveLine} 
                    onChange={e => setShowDefensiveLine(e.target.checked)} 
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-item">
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>Midfield Line (MID)</span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={showMidfieldLine} 
                    onChange={e => setShowMidfieldLine(e.target.checked)} 
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-item">
                <span style={{ color: '#10b981', fontWeight: 600 }}>Attacking Line (ATT)</span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={showAttackingLine} 
                    onChange={e => setShowAttackingLine(e.target.checked)} 
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-item">
                <span style={{ color: '#ec4899', fontWeight: 600 }}>Space Between Lines & Dimensions</span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={showInterLineSpace} 
                    onChange={e => setShowInterLineSpace(e.target.checked)} 
                    disabled={!showDefensiveLine && !showMidfieldLine && !showAttackingLine}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>
          </>
        );

      case 'physical-perf':
        return (
          <>
            <div className="card-header">
              <span className="card-title">
                <Activity size={16} color="#10b981" /> PHYSICAL PERFORMANCE ({currentMatchMin}')
              </span>
              <GripVertical size={16} className="drag-handle" title="Drag to swap view" onMouseDown={() => setDraggableCardId('physical-perf')} />
            </div>
            <div className="table-wrapper">
              <table className="physical-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Distance</th>
                    <th>Avg Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {computedPhysicalSummary.map(row => (
                    <tr key={row.player_id}>
                      <td style={{ fontWeight: '600' }}>Player {row.player_id}</td>
                      <td>
                        <div className="progress-bar-container">
                          <div 
                            className="progress-bar-fill" 
                            style={{ width: `${Math.min(100, (row.distKm / maxDistKm) * 100)}%` }}
                          ></div>
                        </div>
                        {row.distKm.toFixed(2)} km
                      </td>
                      <td>{row.avgSpeedKmh.toFixed(1)} km/h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        );

      case 'transition-analytics':
        return (
          <>
            <div className="card-header">
              <span className="card-title">
                <Zap size={16} color="#f59e0b" /> TRANSITION ANALYTICS
              </span>
              <GripVertical size={16} className="drag-handle" title="Drag to swap view" onMouseDown={() => setDraggableCardId('transition-analytics')} />
            </div>
            <div className="transition-analytics-content">
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                Instantaneous speeds during frame playback:
              </p>
              {clipData && clipData.frames[currentFrameIdx] && (
                <div className="player-list-grid">
                  {clipData.frames[currentFrameIdx].players
                    .filter(p => p.team === 'Red Team')
                    .sort((a,b) => parseInt(a.id) - parseInt(b.id))
                    .map(p => (
                      <div key={p.id} className="player-card">
                        <span className="player-circle-icon red-team">{p.id}</span>
                        <div className="player-card-info">
                          <span className="player-card-name">Player {p.id}</span>
                          <span className="player-card-val">Speed: {p.s.toFixed(1)} km/h</span>
                        </div>
                      </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  // Helper renderer for playback controls
  const renderPlaybackControls = () => {
    if (!clipData) return null;

    const relativeTimeSec = currentFrame && typeof currentFrame.timestamp_sec === 'number'
      ? Math.max(0, currentFrame.timestamp_sec - firstFrameTime)
      : 0;

    return (
      <div 
        className="playback-controls"
        draggable={false}
        onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="timeline-bar">
          <button 
            type="button" 
            className="btn" 
            onClick={handlePlayPause}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button 
            type="button" 
            className="btn" 
            onClick={handleReset} 
            title="Reset Clip"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <RotateCcw size={14} />
          </button>
          <input 
            type="range"
            min={0}
            max={clipData.frames.length - 1}
            value={currentFrameIdx}
            onChange={handleSliderChange}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="timeline-slider"
          />
          <span className="time-display">
            {relativeTimeSec.toFixed(2)}s / {activeClip?.duration_sec.toFixed(2)}s
          </span>
        </div>
        <div className="controls-row">
          <div className="btn-group">
            {[0.25, 0.5, 1, 2].map(speed => (
              <button 
                key={speed}
                type="button"
                className={`btn btn-sm ${playbackSpeed === speed ? 'btn-active' : ''}`}
                onClick={() => setPlaybackSpeed(speed)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {speed}x
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Frame {currentFrameIdx + 1} of {clipData.frames.length}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      {/* Sidebar: Clips & Action Types Selector */}
      <div className="sidebar">
        {/* Sidebar Controls & Filters */}
        <div className="sidebar-filters-container">
          {/* Team Switcher Toggle Switch */}
          <div className="filter-group">
            <span className="filter-label">Select Team:</span>
            <div className="team-toggle-group">
              <button
                type="button"
                className={`team-toggle-btn red ${selectedTeam === 'Red Team' ? 'active' : ''}`}
                onClick={() => setSelectedTeam('Red Team')}
              >
                <span className="team-indicator red"></span> Red Team
              </button>
              <button
                type="button"
                className={`team-toggle-btn white ${selectedTeam === 'White Team' ? 'active' : ''}`}
                onClick={() => setSelectedTeam('White Team')}
              >
                <span className="team-indicator white"></span> White Team
              </button>
            </div>
          </div>

          {/* View Mode Toggle Switch (Swapped position: Position #2) */}
          <div className="filter-group">
            <span className="filter-label">View Mode:</span>
            <div className="team-toggle-group">
              <button
                type="button"
                className={`team-toggle-btn ${sidebarViewMode === 'instances' ? 'active-instances' : ''}`}
                onClick={() => setSidebarViewMode('instances')}
              >
                Instances
              </button>
              <button
                type="button"
                className={`team-toggle-btn ${sidebarViewMode === 'possession-maps' ? 'active-sequence' : ''}`}
                onClick={() => setSidebarViewMode('possession-maps')}
              >
                <Layers size={14} /> Sequence Maps
              </button>
            </div>
          </div>
          
          {/* Action Type Selector (Only visible if instances mode is selected: Position #3) */}
          {sidebarViewMode === 'instances' && (
            <div className="filter-group">
              <span className="filter-label">Action Type:</span>
              <select 
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="action-type-select"
              >
                {categoriesList.map(cat => (
                  <option key={cat} value={cat}>{cat.toLowerCase()}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Sidebar Content List */}
        <div className="clip-list">
          {sidebarViewMode === 'possession-maps' ? (
            <div className="action-types-view">
              <div className="sidebar-section-title">
                Action Types ({categoriesList.length}):
              </div>
              <div className="sidebar-section-hint">
                Select an Action Type to view its cumulative Possession Sequence Map:
              </div>
              {categoriesList.map(cat => {
                const count = clips.filter(c => c.team === selectedTeam && c.code === cat).length;
                return (
                  <div 
                    key={cat}
                    className="action-type-card-item"
                    onClick={() => setActiveModalAction({ category: cat, team: selectedTeam })}
                  >
                    <div className="action-type-name">{cat}</div>
                    <div className="action-type-instances-count">{count} Total Instances</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="instances-view">
              <div className="sidebar-section-title">
                Action Instances ({filteredClips.length}):
              </div>

              {filteredClips.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  No actions found for this combination.
                </div>
              ) : (
                filteredClips.map(clip => {
                  const startMin = clip.start_time_sec > 0 ? Math.floor(clip.start_time_sec / 60) : 0;
                  return (
                    <div 
                      key={clip.code_id}
                      className={`clip-card ${activeClipId === clip.code_id ? 'active' : ''}`}
                      onClick={() => setActiveClipId(clip.code_id)}
                    >
                      <div className="clip-card-header">
                        <span className="clip-title">Instance #{clip.code_id}</span>
                        <span className="badge badge-passes">{startMin}'</span>
                      </div>
                      <div className="clip-details">
                        <span>Duration: {clip.duration_sec.toFixed(1)}s</span>
                        <span>Avg Speed: {clip.avg_team_speed_kmh.toFixed(1)} km/h</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="main-content">
        {/* 3x3 Grid Dashboard Layout */}
        <div className="dashboard-grid-layout">
          {cardsOrder.map((cardId, index) => {
            const slotClass = `area-slot-${index}`;
            const isDragging = draggedCardId === cardId;
            const isSameGroup = draggedCardId && getCardGroup(draggedCardId) === getCardGroup(cardId);
            const isDragOver = dragOverCardId === cardId && isSameGroup;

            return (
              <div
                key={cardId}
                className={`grid-card ${slotClass} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                draggable={draggableCardId === cardId}
                onDragStart={(e) => {
                  if (draggableCardId !== cardId) {
                    e.preventDefault();
                    return;
                  }
                  handleDragStart(e, cardId);
                }}
                onDragOver={(e) => handleDragOver(e, cardId)}
                onDragEnter={(e) => handleDragEnter(e, cardId)}
                onDragLeave={(e) => handleDragLeave(e, cardId)}
                onDrop={(e) => handleDrop(e, cardId)}
                onDragEnd={(e) => {
                  handleDragEnd(e);
                  setDraggableCardId(null);
                }}
                onMouseUp={() => setDraggableCardId(null)}
              >
                {renderCardContent(cardId, index === 0)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Popup Modal for Possession Sequence Maps */}
      {activeModalAction && (
        <PossessionSequenceMapModal
          category={activeModalAction.category}
          team={activeModalAction.team}
          onClose={() => setActiveModalAction(null)}
        />
      )}
    </div>
  );
}

export default App;
