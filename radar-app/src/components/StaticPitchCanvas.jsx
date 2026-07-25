import { useEffect, useRef, useState } from 'react';

function StaticPitchCanvas({
  progressions = [],
  passes = [],
  width = 800,
  height = 518,
  showProgressions = true,
  showPasses = true,
  isSequenceMap = false,
  normalizedAttackDirection = "Left to Right (LTR)",
  viewMode = 'flow', // 'flow' | 'heatmap' | 'vectors'
  minFrequency = 1,
  onTopChannelsCalculated,
  onTacticalSummaryCalculated
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: width, h: height });

  // Helper: map pitch coords (0..105, 0..68) to 6x3 pitch grid zone with English names
  const getZone = (x, y) => {
    const col = Math.max(0, Math.min(5, Math.floor((x / 105.0) * 6)));
    const row = Math.max(0, Math.min(2, Math.floor((y / 68.0) * 3)));
    const colNames = ['Deep Defense', 'Defensive Third', 'Midfield Def', 'Midfield Att', 'Attacking Third', 'Penalty Area'];
    const rowNames = ['Left Flank', 'Center', 'Right Flank'];
    return {
      col,
      row,
      id: `${col}_${row}`,
      name: `${colNames[col]} (${rowNames[row]})`
    };
  };

  const getZoneCenterMeters = (col, row) => {
    return {
      xMeters: (col + 0.5) * (105.0 / 6),
      yMeters: (row + 0.5) * (68.0 / 3)
    };
  };

  // Handle responsive resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const targetW = rect.width;
        const targetH = Math.min(rect.height, targetW * (68 / 105));
        setDimensions({
          w: Math.floor(targetW),
          h: Math.floor(targetH > 50 ? targetH : targetW * 0.65)
        });
      }
    };

    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const drawWidth = dimensions.w;
    const drawHeight = dimensions.h;

    const margin = Math.max(12, Math.floor(drawWidth * 0.035));

    // Pitch Dimensions in meters
    const pitchLen = 105.0;
    const pitchWidth = 68.0;

    // Scale mapping functions
    const scaleX = (drawWidth - 2 * margin) / pitchLen;
    const scaleY = (drawHeight - 2 * margin) / pitchWidth;

    const toCanvasX = (mx) => margin + mx * scaleX;
    const toCanvasY = (my) => margin + my * scaleY;

    // Clear canvas
    ctx.clearRect(0, 0, drawWidth, drawHeight);

    // 1. Draw Pitch Background (Crisp dark tactical pitch)
    const pitchGrad = ctx.createLinearGradient(0, 0, 0, drawHeight);
    pitchGrad.addColorStop(0, '#0a0d16');
    pitchGrad.addColorStop(1, '#0e111d');
    ctx.fillStyle = pitchGrad;
    ctx.fillRect(0, 0, drawWidth, drawHeight);

    // Pitch grid lines (6x3 tactical zones boundary faint lines)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    for (let c = 1; c < 6; c++) {
      const gx = toCanvasX(c * (105 / 6));
      ctx.beginPath();
      ctx.moveTo(gx, margin);
      ctx.lineTo(gx, drawHeight - margin);
      ctx.stroke();
    }
    for (let r = 1; r < 3; r++) {
      const gy = toCanvasY(r * (68 / 3));
      ctx.beginPath();
      ctx.moveTo(margin, gy);
      ctx.lineTo(drawWidth - margin, gy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 2. Draw Pitch Line Geometry
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(1.5, drawWidth / 420);

    // Outer boundary
    ctx.strokeRect(margin, margin, drawWidth - 2 * margin, drawHeight - 2 * margin);

    // Halfway line
    ctx.beginPath();
    ctx.moveTo(toCanvasX(pitchLen / 2), margin);
    ctx.lineTo(toCanvasX(pitchLen / 2), drawHeight - margin);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(toCanvasX(pitchLen / 2), toCanvasY(pitchWidth / 2), 9.15 * scaleX, 0, 2 * Math.PI);
    ctx.stroke();

    // Center spot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(toCanvasX(pitchLen / 2), toCanvasY(pitchWidth / 2), 2.5, 0, 2 * Math.PI);
    ctx.fill();

    // Penalty areas
    // Left
    ctx.strokeRect(margin, toCanvasY(pitchWidth / 2 - 20.16), 16.5 * scaleX, 40.32 * scaleY);
    ctx.strokeRect(margin, toCanvasY(pitchWidth / 2 - 9.16), 5.5 * scaleX, 18.32 * scaleY);
    ctx.beginPath();
    ctx.arc(toCanvasX(11.0), toCanvasY(pitchWidth / 2), 2.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(toCanvasX(11.0), toCanvasY(pitchWidth / 2), 9.15 * scaleX, -Math.acos(5.5 / 9.15), Math.acos(5.5 / 9.15));
    ctx.stroke();

    // Right
    ctx.strokeRect(toCanvasX(pitchLen - 16.5), toCanvasY(pitchWidth / 2 - 20.16), 16.5 * scaleX, 40.32 * scaleY);
    ctx.strokeRect(toCanvasX(pitchLen - 5.5), toCanvasY(pitchWidth / 2 - 9.16), 5.5 * scaleX, 18.32 * scaleY);
    ctx.beginPath();
    ctx.arc(toCanvasX(pitchLen - 11.0), toCanvasY(pitchWidth / 2), 2.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(toCanvasX(pitchLen - 11.0), toCanvasY(pitchWidth / 2), 9.15 * scaleX, Math.PI - Math.acos(5.5 / 9.15), Math.PI + Math.acos(5.5 / 9.15));
    ctx.stroke();

    // Goals
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.strokeRect(margin - 4, toCanvasY(pitchWidth / 2 - 3.66), 4, 7.32 * scaleY);
    ctx.strokeRect(drawWidth - margin, toCanvasY(pitchWidth / 2 - 3.66), 4, 7.32 * scaleY);

    // =========================================================
    // MODE 1: DOMINANT FLOWS CORRIDOR AGGREGATION ('flow')
    // =========================================================
    if (viewMode === 'flow') {
      const flowMap = {};
      const internalZoneMap = {};

      let totalCarriesCount = 0;
      let totalPassesCount = 0;

      if (showProgressions && progressions.length > 0) {
        progressions.forEach(prog => {
          const pts = prog.points;
          if (!pts || pts.length < 2) return;
          const startPt = pts[0];
          const endPt = pts[pts.length - 1];
          const zStart = getZone(startPt[0], startPt[1]);
          const zEnd = getZone(endPt[0], endPt[1]);

          totalCarriesCount += 1;

          if (zStart.id === zEnd.id) {
            if (!internalZoneMap[zStart.id]) {
              internalZoneMap[zStart.id] = { zone: zStart, carries: 0, passes: 0 };
            }
            internalZoneMap[zStart.id].carries += 1;
          } else {
            const key = `${zStart.id}->${zEnd.id}`;
            if (!flowMap[key]) {
              flowMap[key] = { zStart, zEnd, carries: 0, passes: 0, total: 0 };
            }
            flowMap[key].carries += 1;
            flowMap[key].total += 1;
          }
        });
      }

      if (showPasses && passes.length > 0) {
        passes.forEach(p => {
          const sx = p.start ? p.start[0] : p.start_x;
          const sy = p.start ? p.start[1] : p.start_y;
          const ex = p.end ? p.end[0] : p.end_x;
          const ey = p.end ? p.end[1] : p.end_y;

          if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) return;

          const zStart = getZone(sx, sy);
          const zEnd = getZone(ex, ey);

          totalPassesCount += 1;

          if (zStart.id === zEnd.id) {
            if (!internalZoneMap[zStart.id]) {
              internalZoneMap[zStart.id] = { zone: zStart, carries: 0, passes: 0 };
            }
            internalZoneMap[zStart.id].passes += 1;
          } else {
            const key = `${zStart.id}->${zEnd.id}`;
            if (!flowMap[key]) {
              flowMap[key] = { zStart, zEnd, carries: 0, passes: 0, total: 0 };
            }
            flowMap[key].passes += 1;
            flowMap[key].total += 1;
          }
        });
      }

      // Convert flow map to array and sort by total volume
      let flows = Object.values(flowMap);
      flows.sort((a, b) => b.total - a.total);

      // Keep top 12 corridors so all significant channels are displayed
      const topFlows = flows.slice(0, 12);
      const totalActionsInFlows = topFlows.reduce((sum, f) => sum + f.total, 0);

      // English Tactical Summary Calculation
      if (onTopChannelsCalculated) {
        onTopChannelsCalculated(topFlows);
      }
      if (onTacticalSummaryCalculated && topFlows.length > 0) {
        const primary = topFlows[0];
        const pct = totalActionsInFlows > 0 ? Math.round((primary.total / totalActionsInFlows) * 100) : 0;
        const summaryText = `Total: ${totalCarriesCount} Carries & ${totalPassesCount} Passes. Primary corridor: ${primary.zStart.name} ➔ ${primary.zEnd.name} (${primary.total} actions, ${pct}% of main flow).`;
        onTacticalSummaryCalculated(summaryText);
      }

      // Calculate total action cardinality: (carries count + passes count) per zone for proportional sky blue opacity shading
      const zoneVolumeMap = {};

      if (showProgressions && progressions.length > 0) {
        progressions.forEach(prog => {
          const pts = prog.points;
          if (!pts || pts.length < 2) return;
          const zStart = getZone(pts[0][0], pts[0][1]);
          const zEnd = getZone(pts[pts.length - 1][0], pts[pts.length - 1][1]);
          zoneVolumeMap[zStart.id] = (zoneVolumeMap[zStart.id] || 0) + 1;
          if (zEnd.id !== zStart.id) {
            zoneVolumeMap[zEnd.id] = (zoneVolumeMap[zEnd.id] || 0) + 1;
          }
        });
      }

      if (showPasses && passes.length > 0) {
        passes.forEach(p => {
          const sx = p.start ? p.start[0] : p.start_x;
          const sy = p.start ? p.start[1] : p.start_y;
          const ex = p.end ? p.end[0] : p.end_x;
          const ey = p.end ? p.end[1] : p.end_y;

          if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) return;

          const zStart = getZone(sx, sy);
          const zEnd = getZone(ex, ey);
          zoneVolumeMap[zStart.id] = (zoneVolumeMap[zStart.id] || 0) + 1;
          if (zEnd.id !== zStart.id) {
            zoneVolumeMap[zEnd.id] = (zoneVolumeMap[zEnd.id] || 0) + 1;
          }
        });
      }

      let maxZoneVol = 1;
      Object.values(zoneVolumeMap).forEach(vol => {
        if (vol > maxZoneVol) maxZoneVol = vol;
      });

      // Render sky blue zone fill with opacity proportional to zone action cardinality
      Object.keys(zoneVolumeMap).forEach(zoneId => {
        const vol = zoneVolumeMap[zoneId];
        if (vol <= 0) return;

        const [cStr, rStr] = zoneId.split('_');
        const col = parseInt(cStr, 10);
        const row = parseInt(rStr, 10);

        const zx = toCanvasX(col * (105 / 6));
        const zy = toCanvasY(row * (68 / 3));
        const zw = (105 / 6) * scaleX;
        const zh = (68 / 3) * scaleY;

        // Proportional ratio: 0.0 to 1.0
        const ratio = vol / maxZoneVol;

        // Opacity scales from faint 0.06 for low activity to 0.45 for peak activity
        const fillAlpha = (0.06 + ratio * 0.39).toFixed(3);
        const strokeAlpha = (0.15 + ratio * 0.45).toFixed(3);

        ctx.fillStyle = `rgba(56, 189, 248, ${fillAlpha})`;
        ctx.fillRect(zx, zy, zw, zh);

        ctx.strokeStyle = `rgba(56, 189, 248, ${strokeAlpha})`;
        ctx.lineWidth = Math.max(1, Math.min(2.5, 1 + ratio * 1.5));
        ctx.strokeRect(zx, zy, zw, zh);
      });

      // Draw Top Flow Corridors: Separate/Offset Green Carry Arrows & Purple Pass Arrows
      topFlows.forEach((flow, rankIdx) => {
        const { zStart, zEnd, carries, passes, total } = flow;
        const startM = getZoneCenterMeters(zStart.col, zStart.row);
        const endM = getZoneCenterMeters(zEnd.col, zEnd.row);

        const sx = toCanvasX(startM.xMeters);
        const sy = toCanvasY(startM.yMeters);
        const ex = toCanvasX(endM.xMeters);
        const ey = toCanvasY(endM.yMeters);

        const angle = Math.atan2(ey - sy, ex - sx);

        // Helper to draw single directional arrow (Carry or Pass)
        const drawArrow = (count, color, offsetDirection, labelPrefix) => {
          ctx.save();

          const offsetMag = offsetDirection * 8;
          const perpX = -Math.sin(angle) * offsetMag;
          const perpY = Math.cos(angle) * offsetMag;

          const startX = sx + perpX;
          const startY = sy + perpY;
          const endX = ex + perpX;
          const endY = ey + perpY;

          const baseWidth = Math.max(2.8, Math.min(10, 2.5 + count * 0.6));
          ctx.lineWidth = baseWidth;
          ctx.strokeStyle = color;

          const midX = (startX + endX) / 2 + perpX * 1.5;
          const midY = (startY + endY) / 2 + perpY * 1.5;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.quadraticCurveTo(midX, midY, endX, endY);
          ctx.stroke();

          // Start origin circle
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(startX, startY, baseWidth * 0.7, 0, 2 * Math.PI);
          ctx.fill();

          // Arrowhead
          const arrowLen = Math.max(8, Math.min(14, baseWidth * 1.4 + 3));
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(endX - arrowLen * Math.cos(angle - Math.PI / 5), endY - arrowLen * Math.sin(angle - Math.PI / 5));
          ctx.lineTo(endX - arrowLen * Math.cos(angle + Math.PI / 5), endY - arrowLen * Math.sin(angle + Math.PI / 5));
          ctx.fill();

          // Badge Pill
          const badgeLabel = `${labelPrefix} (${count})`;
          ctx.font = 'bold 10px system-ui';
          const tw = ctx.measureText(badgeLabel).width;
          const bw = tw + 10;
          const bh = 18;

          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;

          ctx.beginPath();
          ctx.roundRect(midX - bw / 2, midY - bh / 2, bw, bh, 9);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeLabel, midX, midY + 0.5);

          ctx.restore();
        };

        if (carries > 0 && passes > 0) {
          // Draw BOTH Carry (Green) and Pass (Purple) offset side-by-side!
          drawArrow(carries, '#10b981', -1, `Carry`);
          drawArrow(passes, '#a855f7', 1, `Pass`);
        } else if (carries > 0) {
          drawArrow(carries, '#10b981', (rankIdx % 2 === 0 ? 0.5 : -0.5), `Carry`);
        } else if (passes > 0) {
          drawArrow(passes, '#a855f7', (rankIdx % 2 === 0 ? 0.5 : -0.5), `Pass`);
        }
      });

      // Draw In-Zone Activity Badges for Intra-Zone Actions (zStart === zEnd)
      Object.values(internalZoneMap).forEach(item => {
        const { zone, carries, passes } = item;
        const centerM = getZoneCenterMeters(zone.col, zone.row);
        const cx = toCanvasX(centerM.xMeters);
        const cy = toCanvasY(centerM.yMeters) + 20;

        ctx.save();
        ctx.font = 'bold 9px system-ui';

        let text = '';
        if (carries > 0 && passes > 0) text = `In-Zone: ${carries}C | ${passes}P`;
        else if (carries > 0) text = `In-Zone: ${carries} Carries`;
        else if (passes > 0) text = `In-Zone: ${passes} Passes`;

        if (text) {
          const tw = ctx.measureText(text).width;
          const bw = tw + 8;
          const bh = 14;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#cbd5e1';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, cx, cy);
        }
        ctx.restore();
      });

      // Flow Legend in Bottom Left (English)
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(margin + 8, drawHeight - margin - 32, 260, 26, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = '11px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      
      // Dots & Labels
      ctx.fillStyle = '#10b981';
      ctx.beginPath(); ctx.arc(margin + 20, drawHeight - margin - 19, 4, 0, 2*Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillText('Carries', margin + 28, drawHeight - margin - 19);

      ctx.fillStyle = '#a855f7';
      ctx.beginPath(); ctx.arc(margin + 95, drawHeight - margin - 19, 4, 0, 2*Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillText('Passes', margin + 103, drawHeight - margin - 19);

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(margin + 170, drawHeight - margin - 19, 4, 0, 2*Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillText('Active Channels', margin + 178, drawHeight - margin - 19);
      ctx.restore();
    }

    // =========================================================
    // MODE 2: RAW VECTOR OVERLAY ('vectors')
    // =========================================================
    else {
      // 3. Draw Progression Lines (Carries)
      if (showProgressions && progressions.length > 0) {
        progressions.forEach((prog) => {
          const pts = prog.points;
          if (!pts || pts.length < 2) return;

          ctx.save();
          ctx.beginPath();

          const alpha = isSequenceMap ? 0.75 : 0.95;
          ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
          ctx.lineWidth = isSequenceMap ? Math.max(1.5, drawWidth / 480) : Math.max(2.4, drawWidth / 320);

          pts.forEach((pt, idx) => {
            const cx = toCanvasX(pt[0]);
            const cy = toCanvasY(pt[1]);
            if (idx === 0) {
              ctx.moveTo(cx, cy);
            } else {
              ctx.lineTo(cx, cy);
            }
          });
          ctx.stroke();

          // Arrowhead at end of carry
          const lastPt = pts[pts.length - 1];
          const prevPt = pts[pts.length - 2];
          const endX = toCanvasX(lastPt[0]);
          const endY = toCanvasY(lastPt[1]);
          const prevX = toCanvasX(prevPt[0]);
          const prevY = toCanvasY(prevPt[1]);

          if (!isNaN(endX) && !isNaN(endY) && !isNaN(prevX) && !isNaN(prevY)) {
            const angle = Math.atan2(endY - prevY, endX - prevX);
            const arrowLen = isSequenceMap ? Math.max(5.5, drawWidth / 130) : Math.max(7.5, drawWidth / 100);

            ctx.fillStyle = `rgba(16, 185, 129, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - arrowLen * Math.cos(angle - Math.PI / 6), endY - arrowLen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(endX - arrowLen * Math.cos(angle + Math.PI / 6), endY - arrowLen * Math.sin(angle + Math.PI / 6));
            ctx.fill();

            if (!isSequenceMap) {
              const startX = toCanvasX(pts[0][0]);
              const startY = toCanvasY(pts[0][1]);
              ctx.fillStyle = '#059669';
              ctx.beginPath();
              ctx.arc(startX, startY, Math.max(3.5, drawWidth / 220), 0, 2 * Math.PI);
              ctx.fill();
            }
          }

          ctx.restore();
        });
      }

      // 4. Draw Pass Vectors
      if (showPasses && passes.length > 0) {
        passes.forEach((p) => {
          const sx = toCanvasX(p.start ? p.start[0] : p.start_x);
          const sy = toCanvasY(p.start ? p.start[1] : p.start_y);
          const ex = toCanvasX(p.end ? p.end[0] : p.end_x);
          const ey = toCanvasY(p.end ? p.end[1] : p.end_y);

          if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) return;

          ctx.save();
          const alpha = isSequenceMap ? 0.75 : 0.95;
          ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
          ctx.lineWidth = isSequenceMap ? Math.max(1.4, drawWidth / 520) : Math.max(2.2, drawWidth / 360);

          if (!isSequenceMap) {
            ctx.setLineDash([6, 4]);
          }

          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.setLineDash([]);

          const angle = Math.atan2(ey - sy, ex - sx);
          const arrowLen = isSequenceMap ? Math.max(5.5, drawWidth / 130) : Math.max(7.5, drawWidth / 100);
          ctx.fillStyle = `rgba(192, 132, 252, ${alpha})`;

          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - arrowLen * Math.cos(angle - Math.PI / 6), ey - arrowLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(ex - arrowLen * Math.cos(angle + Math.PI / 6), ey - arrowLen * Math.sin(angle + Math.PI / 6));
          ctx.fill();

          if (!isSequenceMap) {
            ctx.fillStyle = 'rgba(168, 85, 247, 0.8)';
            ctx.beginPath();
            ctx.arc(sx, sy, 3, 0, 2 * Math.PI);
            ctx.fill();
          }

          ctx.restore();
        });
      }
    }

    // 5. Draw Attack Direction Banner Overlay for Sequence Maps
    if (isSequenceMap) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`Attack Direction: ${normalizedAttackDirection} ➔`, drawWidth - margin - 8, margin + 15);
      ctx.restore();
    }
  }, [progressions, passes, dimensions, showProgressions, showPasses, isSequenceMap, normalizedAttackDirection, viewMode, minFrequency, onTopChannelsCalculated, onTacticalSummaryCalculated]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '180px' }}>
      <canvas 
        ref={canvasRef} 
        width={dimensions.w} 
        height={dimensions.h} 
        style={{ width: `${dimensions.w}px`, height: `${dimensions.h}px`, borderRadius: '6px', display: 'block' }}
      />
    </div>
  );
}

export default StaticPitchCanvas;
