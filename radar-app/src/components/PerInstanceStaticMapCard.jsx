import { useState, useEffect } from 'react';
import StaticPitchCanvas from './StaticPitchCanvas';
import { Camera, Footprints, ArrowRightLeft } from 'lucide-react';

function PerInstanceStaticMapCard({ activeClipId, activeClip }) {
  const [mapData, setMapData] = useState(null);
  const [showProgressions, setShowProgressions] = useState(true);
  const [showPasses, setShowPasses] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeClipId) return;

    setLoading(true);
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

  return (
    <div className="canvas-container-card view-primary">
      <div className="view-card-header" style={{ justifyContent: 'space-between' }}>
        <span className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Camera size={16} color="#06b6d4" /> Static Map — Instance #{activeClipId}
        </span>
        <div style={{ display: 'flex', gap: '15px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#06b6d4', display: 'inline-block' }}></span>
            Carries: <strong style={{ color: 'white' }}>{progressions.length}</strong>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#8b5cf6', display: 'inline-block' }}></span>
            Passes: <strong style={{ color: 'white' }}>{passes.length}</strong>
          </span>
        </div>
      </div>

      <div className="canvas-wrapper">
        <StaticPitchCanvas
          progressions={progressions}
          passes={passes}
          showProgressions={showProgressions}
          showPasses={showPasses}
          isSequenceMap={false}
          width={800}
          height={518}
        />
      </div>

      {/* Layer Toggles & Metrics Summary */}
      <div style={{ padding: '12px 15px', backgroundColor: 'rgba(15, 17, 26, 0.8)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '15px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: showProgressions ? '#06b6d4' : 'var(--text-secondary)' }}>
            <input 
              type="checkbox" 
              checked={showProgressions} 
              onChange={e => setShowProgressions(e.target.checked)} 
            />
            <Footprints size={14} /> Progression Lines ({progressions.length})
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: showPasses ? '#8b5cf6' : 'var(--text-secondary)' }}>
            <input 
              type="checkbox" 
              checked={showPasses} 
              onChange={e => setShowPasses(e.target.checked)} 
            />
            <ArrowRightLeft size={14} /> Pass Vectors ({passes.length})
          </label>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Total Carry Dist: <strong style={{ color: '#06b6d4' }}>{totalProgDist.toFixed(1)}m</strong> | Attack Dir: <strong style={{ color: 'white' }}>{mapData?.clip_info?.attack_direction?.toUpperCase() || 'LTR'}</strong>
        </div>
      </div>
    </div>
  );
}

export default PerInstanceStaticMapCard;
