import { useState, useEffect } from 'react';
import StaticPitchCanvas from './StaticPitchCanvas';
import { Camera, Footprints, ArrowRightLeft, GripVertical, ArrowRight } from 'lucide-react';

function PerInstanceStaticMapCard({ activeClipId, activeClip, onHandleMouseDown }) {
  const [mapData, setMapData] = useState(null);
  const [showProgressions, setShowProgressions] = useState(true);
  const [showPasses, setShowPasses] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeClipId) return;

    setLoading(true);
    setShowProgressions(true);
    setShowPasses(true);

    fetch(`/data/clip_${activeClipId}_map.json`)
      .then(res => res.json())
      .then(data => {
        setMapData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(`Error loading clip map ${activeClipId}:`, err);
        setMapData(null);
        setLoading(false);
      });
  }, [activeClipId]);

  if (loading) {
    return (
      <div className="canvas-container-card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading per-instance static map data...
      </div>
    );
  }

  const progressions = mapData?.progressions || [];
  const passes = mapData?.passes || [];
  const totalProgDist = progressions.reduce((sum, p) => sum + (p.distance_m || 0), 0);
  const attackDir = mapData?.clip_info?.attack_direction?.toUpperCase() || 'LTR';

  return (
    <div className="canvas-container-card view-primary" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="view-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '6px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <span className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-primary)' }}>
          <Camera size={16} color="#10b981" /> STATIC MAP #{activeClipId}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <GripVertical size={16} className="drag-handle" title="Drag to swap view" onMouseDown={onHandleMouseDown} />
        </div>
      </div>

      {/* Canvas Wrapper */}
      <div className="canvas-wrapper" style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <StaticPitchCanvas
          progressions={progressions}
          passes={passes}
          showProgressions={showProgressions}
          showPasses={showPasses}
          isSequenceMap={false}
        />
      </div>

      {/* Metrics & Filter Pill Buttons (No square checkbox inputs) */}
      <div className="map-metrics-ribbon">
        <div className="ribbon-toggles">
          <button
            type="button"
            className={`filter-pill-btn green ${showProgressions ? 'active' : ''}`}
            onClick={() => setShowProgressions(prev => !prev)}
          >
            <span className="pill-dot green"></span>
            <Footprints size={13} /> Carries ({progressions.length})
          </button>
          <button
            type="button"
            className={`filter-pill-btn purple ${showPasses ? 'active' : ''}`}
            onClick={() => setShowPasses(prev => !prev)}
          >
            <span className="pill-dot purple"></span>
            <ArrowRightLeft size={13} /> Pass Vectors ({passes.length})
          </button>
        </div>

        <div className="ribbon-metrics">
          <div className="metric-badge green-badge">
            <Footprints size={13} />
            <span className="label">Total Carry Dist:</span>
            <strong className="value">{totalProgDist.toFixed(1)}m</strong>
          </div>
          <div className="metric-badge sky-badge">
            <ArrowRight size={13} />
            <span className="label">Attack Dir:</span>
            <strong className="value">{attackDir}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PerInstanceStaticMapCard;
