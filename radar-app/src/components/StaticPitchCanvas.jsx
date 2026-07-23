import { useEffect, useRef } from 'react';

function StaticPitchCanvas({
  progressions = [],
  passes = [],
  width = 800,
  height = 518,
  showProgressions = true,
  showPasses = true,
  opacityScale = 1.0,
  isSequenceMap = false,
  normalizedAttackDirection = "Left to Right (LTR)"
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const margin = 20;

    // Pitch Dimensions in meters
    const pitchLen = 105.0;
    const pitchWidth = 68.0;

    // Scale mapping functions
    const scaleX = (width - 2 * margin) / pitchLen;
    const scaleY = (height - 2 * margin) / pitchWidth;

    const toCanvasX = (mx) => margin + mx * scaleX;
    const toCanvasY = (my) => margin + my * scaleY;

    // 1. Draw Pitch Background
    ctx.fillStyle = '#0f111a';
    ctx.fillRect(0, 0, width, height);

    // Dotted pitch grid
    ctx.strokeStyle = 'rgba(38, 41, 56, 0.4)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= pitchLen; x += 105 / 6) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(x), margin);
      ctx.lineTo(toCanvasX(x), height - margin);
      ctx.stroke();
    }

    // 2. Draw Pitch Line Geometry (matching main radar view exactly)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;

    // Outer boundary
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
    ctx.beginPath();
    ctx.arc(toCanvasX(11.0), toCanvasY(pitchWidth / 2), 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(toCanvasX(11.0), toCanvasY(pitchWidth / 2), 9.15 * scaleX, -Math.acos(5.5 / 9.15), Math.acos(5.5 / 9.15));
    ctx.stroke();

    // Right
    ctx.strokeRect(toCanvasX(pitchLen - 16.5), toCanvasY(pitchWidth / 2 - 20.16), 16.5 * scaleX, 40.32 * scaleY);
    ctx.strokeRect(toCanvasX(pitchLen - 5.5), toCanvasY(pitchWidth / 2 - 9.16), 5.5 * scaleX, 18.32 * scaleY);
    ctx.beginPath();
    ctx.arc(toCanvasX(pitchLen - 11.0), toCanvasY(pitchWidth / 2), 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(toCanvasX(pitchLen - 11.0), toCanvasY(pitchWidth / 2), 9.15 * scaleX, Math.PI - Math.acos(5.5 / 9.15), Math.PI + Math.acos(5.5 / 9.15));
    ctx.stroke();

    // Goals
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.strokeRect(margin - 4, toCanvasY(pitchWidth / 2 - 3.66), 4, 7.32 * scaleY);
    ctx.strokeRect(width - margin, toCanvasY(pitchWidth / 2 - 3.66), 4, 7.32 * scaleY);

    // 3. Draw Progression Lines (Ball carries)
    if (showProgressions && progressions.length > 0) {
      progressions.forEach((prog) => {
        const pts = prog.points;
        if (!pts || pts.length < 2) return;

        ctx.save();
        ctx.beginPath();

        const baseAlpha = isSequenceMap ? Math.min(0.65, 0.15 * opacityScale) : 0.85;
        ctx.strokeStyle = `rgba(6, 182, 212, ${baseAlpha})`; // Vibrant Cyan (#06b6d4)
        ctx.lineWidth = isSequenceMap ? 1.8 : 2.5;

        if (!isSequenceMap) {
          ctx.shadowColor = 'rgba(6, 182, 212, 0.6)';
          ctx.shadowBlur = 6;
        }

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

        // Draw start dot and end indicator dot for single instance map
        if (!isSequenceMap) {
          const startX = toCanvasX(pts[0][0]);
          const startY = toCanvasY(pts[0][1]);
          const endX = toCanvasX(pts[pts.length - 1][0]);
          const endY = toCanvasY(pts[pts.length - 1][1]);

          // Start node (emerald green)
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(startX, startY, 4, 0, 2 * Math.PI);
          ctx.fill();

          // End node (cyan dot)
          ctx.fillStyle = '#06b6d4';
          ctx.beginPath();
          ctx.arc(endX, endY, 5, 0, 2 * Math.PI);
          ctx.fill();
        }

        ctx.restore();
      });
    }

    // 4. Draw Pass Lines (Arrows)
    if (showPasses && passes.length > 0) {
      passes.forEach((p) => {
        const sx = toCanvasX(p.start ? p.start[0] : p.start_x);
        const sy = toCanvasY(p.start ? p.start[1] : p.start_y);
        const ex = toCanvasX(p.end ? p.end[0] : p.end_x);
        const ey = toCanvasY(p.end ? p.end[1] : p.end_y);

        if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) return;

        ctx.save();
        const baseAlpha = isSequenceMap ? Math.min(0.65, 0.15 * opacityScale) : 0.85;
        ctx.strokeStyle = `rgba(139, 92, 246, ${baseAlpha})`; // Vibrant Purple/Violet (#8b5cf6)
        ctx.lineWidth = isSequenceMap ? 1.5 : 2;

        if (!isSequenceMap) {
          ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
          ctx.shadowBlur = 5;
          ctx.setLineDash([5, 3]);
        }

        // Vector line
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow head
        const angle = Math.atan2(ey - sy, ex - sx);
        const arrowLen = isSequenceMap ? 6 : 8;
        ctx.fillStyle = `rgba(139, 92, 246, ${baseAlpha * 1.2})`;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - arrowLen * Math.cos(angle - Math.PI / 6), ey - arrowLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ex - arrowLen * Math.cos(angle + Math.PI / 6), ey - arrowLen * Math.sin(angle + Math.PI / 6));
        ctx.fill();

        // Start origin point
        if (!isSequenceMap) {
          ctx.fillStyle = 'rgba(139, 92, 246, 0.6)';
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, 2 * Math.PI);
          ctx.fill();
        }

        ctx.restore();
      });
    }

    // 5. Draw Attack Direction Vector Overlay for Sequence Maps
    if (isSequenceMap) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`Attack Direction: ${normalizedAttackDirection} ➔`, width - margin - 10, margin + 15);
      ctx.restore();
    }
  }, [progressions, passes, width, height, showProgressions, showPasses, opacityScale, isSequenceMap, normalizedAttackDirection]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      style={{ width: '100%', height: 'auto', borderRadius: '8px', display: 'block' }}
    />
  );
}

export default StaticPitchCanvas;
