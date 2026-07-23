import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ArrowLeftRight,
  Columns,
  LayoutGrid,
  Tv,
  Radio,
  Maximize2
} from 'lucide-react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('transitions');
  const [clips, setClips] = useState([]);
  const [activeClipId, setActiveClipId] = useState(null);
  const [clipData, setClipData] = useState(null);
  const [fullMatchSummary, setFullMatchSummary] = useState([]);
  const [teamsMetadata, setTeamsMetadata] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  // View mode and layout settings
  const [primaryView, setPrimaryView] = useState('radar'); // 'radar' | 'video'
  const [layoutMode, setLayoutMode] = useState('asymmetric'); // 'asymmetric' | 'equal'

  // Sidebar Filters
  const [selectedTeam, setSelectedTeam] = useState('Red Team');
  const [selectedCategory, setSelectedCategory] = useState('ATTACKING TRANSITION');

  // Visual Toggles
  const [showOpponent, setShowOpponent] = useState(true);
  const [showCentroid, setShowCentroid] = useState(false);
  const [showPitchControl, setShowPitchControl] = useState(false);
  const [showPassMap, setShowPassMap] = useState(true);
  const [showDefensiveLine, setShowDefensiveLine] = useState(false);
  const [showMidfieldLine, setShowMidfieldLine] = useState(false);
  const [showAttackingLine, setShowAttackingLine] = useState(false);
  
  // Interactive tooltips / selections
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hoveredPlayer, setHoveredPlayer] = useState(null);
  
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const videoRef = useRef(null);
  const lastFrameTimeRef = useRef(0);

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

  // Filter clips based on selection
  const filteredClips = clips.filter(c => 
    c.team === selectedTeam && 
    c.code === selectedCategory
  );

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

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying || !clipData) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const frameRate = 25; // 25 frames per second in Metrica data
    const intervalMs = 1000 / (frameRate * playbackSpeed);

    const playLoop = (timestamp) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastFrameTimeRef.current;

      if (elapsed >= intervalMs) {
        setCurrentFrameIdx(prevIdx => {
          if (prevIdx >= clipData.frames.length - 1) {
            setIsPlaying(false); // Loop back or stop
            return 0;
          }
          return prevIdx + 1;
        });
        lastFrameTimeRef.current = timestamp;
      }

      animationRef.current = requestAnimationFrame(playLoop);
    };

    animationRef.current = requestAnimationFrame(playLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      lastFrameTimeRef.current = 0;
    };
  }, [isPlaying, clipData, playbackSpeed]);

  // Sync video playback state (play/pause)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.play().catch(err => console.log("Video playback delayed:", err));
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Sync video current time when tracking frame updates
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clipData) return;

    const currentFrame = clipData.frames[currentFrameIdx];
    if (!currentFrame) return;

    // Use a tolerance threshold of 0.15s to keep seek operations smooth
    const diff = Math.abs(video.currentTime - currentFrame.timestamp_sec);
    if (diff > 0.15) {
      video.currentTime = currentFrame.timestamp_sec;
    }
  }, [currentFrameIdx, clipData]);

  // Sync video playback rate (speed)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackSpeed;
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
    if (showPassMap && clipData.passes.length > 0) {
      clipData.passes.forEach(p => {
        const sx = toCanvasX(p.start_x);
        const sy = toCanvasY(p.start_y);
        const ex = toCanvasX(p.end_x);
        const ey = toCanvasY(p.end_y);

        // Draw pass vector line
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrow head
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 8 * Math.cos(angle - Math.PI / 6), ey - 8 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ex - 8 * Math.cos(angle + Math.PI / 6), ey - 8 * Math.sin(angle + Math.PI / 6));
        ctx.fill();

        // Small indicator circle at start of pass
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

        // Draw diamond centroid
        ctx.fillStyle = '#60a5fa';
        ctx.shadowColor = 'rgba(96, 165, 250, 0.5)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(ccx, ccy - 6);
        ctx.lineTo(ccx + 6, ccy);
        ctx.lineTo(ccx, ccy + 6);
        ctx.lineTo(ccx - 6, ccy);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0; // reset shadow

        // Dotted connection lines
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        redPlayers.forEach(p => {
          ctx.beginPath();
          ctx.moveTo(ccx, ccy);
          ctx.lineTo(toCanvasX(p.x), toCanvasY(p.y));
          ctx.stroke();
        });
        ctx.setLineDash([]);

        // Calculate average dispersion in meters
        const distances = redPlayers.map(p => Math.hypot(p.x - cx, p.y - cy));
        const dispersion = distances.reduce((sum, d) => sum + d, 0) / redPlayers.length;

        // Draw dispersion circle
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(ccx, ccy, dispersion * scaleX, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 7.5 Draw Tactical Lines (Defensive, Midfield, Attacking) & Player Distances
    const redTeamPlayers = currentFrame.players.filter(p => p.team === 'Red Team');
    
    if (redTeamPlayers.length >= 3 && (showDefensiveLine || showMidfieldLine || showAttackingLine)) {
      // Sort Red Team players by X coordinate (from defense to attack)
      const sortedByX = [...redTeamPlayers].sort((a, b) => a.x - b.x);

      // Exclude Goalkeeper (player furthest back if team has 10+ players)
      let outfield = sortedByX;
      if (sortedByX.length >= 10) {
        outfield = sortedByX.slice(1);
      }

      const totalOutfield = outfield.length;

      // Calculate line sizes dynamically (e.g. 4 defenders, 3-4 midfielders, 3 attackers)
      const numDef = Math.max(1, Math.round(totalOutfield * 0.38));
      const numAtt = Math.max(1, Math.round(totalOutfield * 0.30));
      const numMid = Math.max(1, totalOutfield - numDef - numAtt);

      const defenders = outfield.slice(0, numDef);
      const midfielders = outfield.slice(numDef, numDef + numMid);
      const attackers = outfield.slice(numDef + numMid);

      const drawTacticalLine = (group, color, labelText, dashPattern = [6, 4]) => {
        if (group.length < 2) return;

        // Sort players within the tactical line by Y coordinate (cross-pitch)
        const linePlayers = [...group].sort((a, b) => a.y - b.y);

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash(dashPattern);
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;

        // 1. Connect line across players in Y-order
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

        // 2. Draw distance badges between consecutive players along the line
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
          ctx.font = 'bold 9px monospace';
          const textMetrics = ctx.measureText(badgeText);
          const padX = 5;
          const badgeW = textMetrics.width + padX * 2;
          const badgeH = 14;

          const bx = midX - badgeW / 2;
          const by = midY - badgeH / 2;

          // Draw Badge background pill
          ctx.fillStyle = 'rgba(10, 11, 16, 0.88)';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;

          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(bx, by, badgeW, badgeH, 4);
          } else {
            ctx.rect(bx, by, badgeW, badgeH);
          }
          ctx.fill();
          ctx.stroke();

          // Draw Distance Text
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, midX, midY + 0.5);
        }

        // 3. Draw line title badge (e.g. "DIF", "CENT", "ATT") near top of line
        if (linePlayers.length > 0) {
          const topP = linePlayers[0];
          const tcx = toCanvasX(topP.x);
          const tcy = toCanvasY(topP.y) - 16;

          ctx.fillStyle = color;
          ctx.font = 'bold 9px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, tcx, Math.max(margin + 6, tcy));
        }

        ctx.restore();
      };

      if (showDefensiveLine) {
        drawTacticalLine(defenders, '#38bdf8', 'DIFESA', [6, 4]); // Cyan / Sky Blue
      }
      if (showMidfieldLine) {
        drawTacticalLine(midfielders, '#f59e0b', 'CENTROCAMPO', [6, 4]); // Amber / Gold
      }
      if (showAttackingLine) {
        drawTacticalLine(attackers, '#10b981', 'ATTACCO', [6, 4]); // Emerald Green
      }
    }

    // 8. Draw Players
    activePlayers.forEach(player => {
      const cx = toCanvasX(player.x);
      const cy = toCanvasY(player.y);
      const radius = 10;

      // Glow effect for players
      ctx.save();
      if (player.team === 'Red Team') {
        ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#ef4444'; // Red Team player circle
        ctx.strokeStyle = '#ffffff';
      } else {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#ffffff'; // White Team player circle
        ctx.strokeStyle = '#111827';
      }
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Jersey number inside player node
      ctx.fillStyle = player.team === 'Red Team' ? '#ffffff' : '#111827';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.id, cx, cy + 0.5);
    });

    // 9. Draw Ball
    const ball = currentFrame.ball;
    if (ball && ball.x !== null && ball.y !== null) {
      const bx = toCanvasX(ball.x);
      const by = toCanvasY(ball.y);
      
      // Ball glow
      ctx.save();
      ctx.shadowColor = 'rgba(253, 224, 71, 0.7)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#facc15'; // Glowing yellow/white ball
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Small dotted line from ball to closest player (possession indicator)
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
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([1, 1]);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(toCanvasX(closestP.x), toCanvasY(closestP.y));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 10. Hover tooltips hit test
    // Find player closest to the mouse cursor
    const mouseXInMeters = toMetersX(mousePos.x);
    const mouseYInMeters = toMetersY(mousePos.y);

    let matchPlayer = null;
    let minMouseDist = Infinity;

    activePlayers.forEach(p => {
      const d = Math.hypot(p.x - mouseXInMeters, p.y - mouseYInMeters);
      if (d < minMouseDist) {
        minMouseDist = d;
        matchPlayer = p;
      }
    });

    if (minMouseDist < 1.5 && matchPlayer) {
      setHoveredPlayer(matchPlayer);

      // Draw dynamic tooltip directly on canvas
      const tcx = toCanvasX(matchPlayer.x);
      const tcy = toCanvasY(matchPlayer.y);

      ctx.save();
      ctx.fillStyle = 'rgba(18, 19, 26, 0.9)';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      
      const tooltipW = 110;
      const tooltipH = 45;
      const tx = tcx + 12 + tooltipW > width - margin ? tcx - 12 - tooltipW : tcx + 12;
      const ty = tcy - tooltipH / 2;

      // Tooltip Card
      ctx.fillRect(tx, ty, tooltipW, tooltipH);
      ctx.strokeRect(tx, ty, tooltipW, tooltipH);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`Player ${matchPlayer.id}`, tx + 8, ty + 12);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '8px system-ui';
      ctx.fillText(`${matchPlayer.team}`, tx + 8, ty + 24);
      
      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`Speed: ${matchPlayer.s.toFixed(1)} km/h`, tx + 8, ty + 36);

      ctx.restore();
    } else {
      setHoveredPlayer(null);
    }

  }, [clipData, currentFrameIdx, showOpponent, showCentroid, showPitchControl, showPassMap, showDefensiveLine, showMidfieldLine, showAttackingLine, mousePos]);

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

  // Helper renderers for view modes
  const renderPlaybackControls = () => {
    if (!clipData) return null;
    return (
      <div className="playback-controls">
        <div className="timeline-bar">
          <button className="btn" onClick={handlePlayPause}>
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button className="btn" onClick={handleReset} title="Reset Clip">
            <RotateCcw size={14} />
          </button>
          <input 
            type="range"
            min={0}
            max={clipData.frames.length - 1}
            value={currentFrameIdx}
            onChange={handleSliderChange}
            className="timeline-slider"
          />
          <span className="time-display">
            {clipData.frames[currentFrameIdx]?.timestamp_sec.toFixed(2)}s / {activeClip?.duration_sec.toFixed(2)}s
          </span>
        </div>
        <div className="controls-row">
          <div className="btn-group">
            {[0.25, 0.5, 1, 2].map(speed => (
              <button 
                key={speed}
                className={`btn ${playbackSpeed === speed ? 'btn-active' : ''}`}
                onClick={() => setPlaybackSpeed(speed)}
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

  const renderControlsCard = () => (
    <div className="control-panel-card">
      <h3>Visual Layers</h3>
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
          <span>Centroid & Dispersion (Red)</span>
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
          <span>Occupancy (Pitch Control)</span>
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
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>Linea Difensiva (DIF)</span>
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
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>Linea Centrocampisti (CENT)</span>
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
          <span style={{ color: '#10b981', fontWeight: 600 }}>Linea Attaccanti (ATT)</span>
          <label className="switch">
            <input 
              type="checkbox" 
              checked={showAttackingLine} 
              onChange={e => setShowAttackingLine(e.target.checked)} 
            />
            <span className="slider"></span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderRadarCard = (isSecondary = false) => (
    <div 
      className={`canvas-container-card ${isSecondary ? 'view-secondary' : 'view-primary'}`}
      onClick={isSecondary ? () => setPrimaryView('radar') : undefined}
    >
      <div className="view-card-header">
        <span className="view-card-title"><Radio size={14} /> Tactical Radar 2D</span>
        {isSecondary && (
          <span className="secondary-badge">
            <Maximize2 size={12} /> Clicca per ingrandire
          </span>
        )}
      </div>

      <div className="canvas-wrapper">
        <canvas 
          ref={canvasRef}
          width={800}
          height={518}
          className="radar-canvas"
          onMouseMove={handleMouseMove}
        />
        {isSecondary && (
          <div className="secondary-hover-hint">
            <ArrowLeftRight size={16} /> Imposta come Principale
          </div>
        )}
      </div>

      {!isSecondary && layoutMode === 'asymmetric' && primaryView === 'radar' && renderPlaybackControls()}
    </div>
  );

  const renderVideoCard = (isSecondary = false) => (
    <div 
      className={`video-container-card ${isSecondary ? 'view-secondary' : 'view-primary'}`}
      onClick={isSecondary ? () => setPrimaryView('video') : undefined}
    >
      <div className="view-card-header">
        <span className="view-card-title"><Tv size={14} /> Visuale Partita</span>
        {isSecondary && (
          <span className="secondary-badge">
            <Maximize2 size={12} /> Clicca per ingrandire
          </span>
        )}
      </div>

      <div className="video-player-wrapper">
        <video 
          ref={videoRef}
          src="/video/DEMO_1001_FULLMATCH.mp4"
          className="video-player"
          muted
          playsInline
        />
        {isSecondary && (
          <div className="secondary-hover-hint">
            <ArrowLeftRight size={16} /> Imposta come Principale
          </div>
        )}
      </div>

      {!isSecondary && layoutMode === 'asymmetric' && primaryView === 'video' && renderPlaybackControls()}
    </div>
  );

  return (
    <div className="dashboard-container">
      {/* Sidebar: Clips Selector */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Metrica Nexus</h2>
          <p>Tactical Action Selector</p>
        </div>

        {/* Filters */}
        <div className="sidebar-filters" style={{ padding: '0 15px 15px 15px', display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Team:</span>
            <select 
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              style={{
                backgroundColor: 'rgba(26, 28, 41, 0.8)',
                color: 'white',
                border: '1px solid var(--border-color)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                outline: 'none',
                width: '100%',
                cursor: 'pointer'
              }}
            >
              {teamsList.map(t => (
                <option key={t} value={t}>{t === 'N/A' ? 'No Team (N/A)' : t}</option>
              ))}
            </select>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Action Type:</span>
            <select 
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{
                backgroundColor: 'rgba(26, 28, 41, 0.8)',
                color: 'white',
                border: '1px solid var(--border-color)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                outline: 'none',
                width: '100%',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {categoriesList.map(cat => (
                <option key={cat} value={cat}>{cat.toLowerCase()}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="clip-list">
          {filteredClips.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              No actions found for this combination.
            </div>
          ) : (
            filteredClips.map(clip => (
              <div 
                key={clip.code_id}
                className={`clip-card ${activeClipId === clip.code_id ? 'active' : ''}`}
                onClick={() => setActiveClipId(clip.code_id)}
              >
                <div className="clip-card-header">
                  <span className="clip-title">Instance #{clip.code_id}</span>
                  <span className="badge badge-passes">{clip.passes_count} passes</span>
                </div>
                <div className="clip-details">
                  <span>Duration: {clip.duration_sec.toFixed(1)}s</span>
                  <span>Avg Speed: {clip.avg_team_speed_kmh.toFixed(1)} km/h</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="main-content">
        {/* Top Info Header */}
        <div className="dashboard-header">
          <div className="dashboard-title">
            <h1>TACTICAL RADAR</h1>
            <p>EPTS Data Visualizer & Performance Dashboard</p>
          </div>
          {activeClip && (
            <div className="clip-stats">
              <div className="stat-item">
                <span className="stat-value">{activeClip.duration_sec.toFixed(1)}s</span>
                <span className="stat-label">Duration</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{activeClip.avg_team_speed_kmh.toFixed(1)} km/h</span>
                <span className="stat-label">Team Speed</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{activeClip.avg_dispersion_m.toFixed(1)}m</span>
                <span className="stat-label">Dispersion</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{activeClip.passes_count}</span>
                <span className="stat-label">Passes</span>
              </div>
            </div>
          )}
        </div>

        {/* View Switcher & Layout Toolbar */}
        <div className="view-mode-toolbar">
          <div className="view-toolbar-section">
            <span className="toolbar-label">Visuale Principale:</span>
            <div className="btn-group">
              <button 
                className={`btn ${primaryView === 'radar' ? 'btn-active' : ''}`}
                onClick={() => setPrimaryView('radar')}
              >
                <Radio size={14} /> Radar 2D
              </button>
              <button 
                className={`btn ${primaryView === 'video' ? 'btn-active' : ''}`}
                onClick={() => setPrimaryView('video')}
              >
                <Tv size={14} /> Visuale Partita
              </button>
              <button 
                className="btn btn-swap"
                onClick={() => setPrimaryView(prev => prev === 'radar' ? 'video' : 'radar')}
                title="Scambia la visuale principale con quella secondaria"
              >
                <ArrowLeftRight size={14} /> Scambia
              </button>
            </div>
          </div>

          <div className="view-toolbar-section">
            <span className="toolbar-label">Dimensione Layout:</span>
            <div className="btn-group">
              <button 
                className={`btn ${layoutMode === 'asymmetric' ? 'btn-active' : ''}`}
                onClick={() => setLayoutMode('asymmetric')}
              >
                <LayoutGrid size={14} /> 1 Grande + 1 Piccola
              </button>
              <button 
                className={`btn ${layoutMode === 'equal' ? 'btn-active' : ''}`}
                onClick={() => setLayoutMode('equal')}
              >
                <Columns size={14} /> Entrambe Uguali (50/50)
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Visualizer Grid Layout */}
        {layoutMode === 'asymmetric' ? (
          <div className="visualizer-grid layout-asymmetric">
            {/* Primary Main View (Large) */}
            <div className="primary-view-container">
              {primaryView === 'radar' ? renderRadarCard(false) : renderVideoCard(false)}
            </div>

            {/* Secondary Column (Small Preview + Controls) */}
            <div className="secondary-column">
              {renderControlsCard()}
              <div className="secondary-view-container">
                {primaryView === 'radar' ? renderVideoCard(true) : renderRadarCard(true)}
              </div>
            </div>
          </div>
        ) : (
          <div className="equal-layout-wrapper">
            {/* Controls Bar */}
            <div className="equal-controls-wrapper">
              {renderControlsCard()}
            </div>

            {/* Dual Equal 50/50 Grid */}
            <div className="visualizer-grid layout-equal">
              <div className="equal-view-card">
                {renderRadarCard(false)}
              </div>
              <div className="equal-view-card">
                {renderVideoCard(false)}
              </div>
            </div>

            {/* Unified Playback Controls Bar */}
            <div className="shared-playback-container">
              {renderPlaybackControls()}
            </div>
          </div>
        )}

        {/* Bottom Tab Panels */}
        <div className="metrics-panel">
          <div className="tabs">
            <span 
              className={`tab ${activeTab === 'transitions' ? 'active' : ''}`}
              onClick={() => setActiveTab('transitions')}
            >
              Transitions Analytics
            </span>
            <span 
              className={`tab ${activeTab === 'performance' ? 'active' : ''}`}
              onClick={() => setActiveTab('performance')}
            >
              Full Match Physical performance
            </span>
          </div>

          <div className="tab-content">
            {activeTab === 'transitions' && (
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  Hover over players on the 2D pitch during playback to analyze instantaneous speeds and tactical coordinate updates frame-by-frame.
                </p>
                {clipData && (
                  <div className="player-list-grid">
                    {clipData.frames[currentFrameIdx]?.players
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
            )}

            {activeTab === 'performance' && (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="physical-table">
                  <thead>
                    <tr>
                      <th>Player Name</th>
                      <th>Total Distance covered</th>
                      <th>Avg Speed (km/h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fullMatchSummary.map(row => (
                      <tr key={row.player_id}>
                        <td style={{ fontWeight: '600' }}>Player {row.player_id} (Red)</td>
                        <td>
                          <div className="progress-bar-container">
                            <div 
                              className="progress-bar-fill" 
                              style={{ width: `${(row.total_distance_meters / 11000) * 100}%` }}
                            ></div>
                          </div>
                          {row.total_distance_meters.toFixed(1)} m
                        </td>
                        <td>{row.avg_speed_kmh.toFixed(1)} km/h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
