import { useEffect, useRef, useState } from 'react';

function StaticPitchCanvas({
  progressions = [],
  passes = [],
  width = 800,
  height = 518,
  showProgressions = true,
  showPasses = true,
  isSequenceMap = false,
  normalizedAttackDirection = "Left to Right (LTR)"
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: width, h: height });

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

    // Pitch grid lines
    ctx.strokeStyle = 'rgba(38, 41, 56, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (let x = 0; x <= pitchLen; x += 105 / 6) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(x), margin);
      ctx.lineTo(toCanvasX(x), drawHeight - margin);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 2. Draw Pitch Line Geometry
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
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

    // 3. Draw Progression Lines (Carries) in VIBRANT GREEN with directional arrowheads
    if (showProgressions && progressions.length > 0) {
      progressions.forEach((prog) => {
        const pts = prog.points;
        if (!pts || pts.length < 2) return;

        ctx.save();
        ctx.beginPath();

        // Sharp, non-blurred green line (#10b981 / #00ff88)
        const alpha = isSequenceMap ? 0.88 : 0.98;
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

        // Calculate end point and direction angle for arrow
        const lastPt = pts[pts.length - 1];
        const prevPt = pts[pts.length - 2];
        const endX = toCanvasX(lastPt[0]);
        const endY = toCanvasY(lastPt[1]);
        const prevX = toCanvasX(prevPt[0]);
        const prevY = toCanvasY(prevPt[1]);

        if (!isNaN(endX) && !isNaN(endY) && !isNaN(prevX) && !isNaN(prevY)) {
          const angle = Math.atan2(endY - prevY, endX - prevX);
          const arrowLen = isSequenceMap ? Math.max(5.5, drawWidth / 130) : Math.max(7.5, drawWidth / 100);

          // Draw Directional Arrowhead at end of carry
          ctx.fillStyle = `rgba(16, 185, 129, ${alpha * 1.1})`;
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(endX - arrowLen * Math.cos(angle - Math.PI / 6), endY - arrowLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(endX - arrowLen * Math.cos(angle + Math.PI / 6), endY - arrowLen * Math.sin(angle + Math.PI / 6));
          ctx.fill();

          // Start origin dot for single map
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

    // 4. Draw Pass Vectors (Passes) in CRISP ELECTRIC PURPLE with sharp arrowheads
    if (showPasses && passes.length > 0) {
      passes.forEach((p) => {
        const sx = toCanvasX(p.start ? p.start[0] : p.start_x);
        const sy = toCanvasY(p.start ? p.start[1] : p.start_y);
        const ex = toCanvasX(p.end ? p.end[0] : p.end_x);
        const ey = toCanvasY(p.end ? p.end[1] : p.end_y);

        if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) return;

        ctx.save();
        const alpha = isSequenceMap ? 0.88 : 0.98;
        ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`; // Electric Purple (#a855f7)
        ctx.lineWidth = isSequenceMap ? Math.max(1.4, drawWidth / 520) : Math.max(2.2, drawWidth / 360);

        if (!isSequenceMap) {
          ctx.setLineDash([6, 4]);
        }

        // Vector line
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pass Arrow head
        const angle = Math.atan2(ey - sy, ex - sx);
        const arrowLen = isSequenceMap ? Math.max(5.5, drawWidth / 130) : Math.max(7.5, drawWidth / 100);
        ctx.fillStyle = `rgba(192, 132, 252, ${alpha * 1.1})`;

        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - arrowLen * Math.cos(angle - Math.PI / 6), ey - arrowLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ex - arrowLen * Math.cos(angle + Math.PI / 6), ey - arrowLen * Math.sin(angle + Math.PI / 6));
        ctx.fill();

        // Start origin point
        if (!isSequenceMap) {
          ctx.fillStyle = 'rgba(168, 85, 247, 0.8)';
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, 2 * Math.PI);
          ctx.fill();
        }

        ctx.restore();
      });
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
  }, [progressions, passes, dimensions, showProgressions, showPasses, isSequenceMap, normalizedAttackDirection]);

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
