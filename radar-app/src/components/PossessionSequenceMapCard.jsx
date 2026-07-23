import { useState, useEffect } from 'react';
import StaticPitchCanvas from './StaticPitchCanvas';
import { Layers, Sliders, Footprints, ArrowRightLeft, Shield } from 'lucide-react';

function slugify(text) {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '_');
}

function PossessionSequenceMapCard({ selectedCategory, selectedTeam }) {
  const [sequenceData, setSequenceData] = useState(null);
  const [opacityScale, setOpacityScale] = useState(1.0);
  const [showProgressions, setShowProgressions] = useState(true);
  const [showPasses, setShowPasses] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!selectedCategory || !selectedTeam) return;

    const catSlug = slugify(selectedCategory);
    const teamSlug = slugify(selectedTeam);
    const filename = `/data/possession_map_${catSlug}_${teamSlug}.json`;

    setLoading(true);
    setError(null);

    fetch(filename)
      .then(res => {
        if (!res.ok) throw new Error(`Sequence map not found for ${selectedCategory} (${selectedTeam})`);
        return res.json();
      })
      .then(data => {
        setSequenceData(data);
        setLoading(false);
      })
      .catch(err => {
        console.warn(err.message);
        setSequenceData(null);
        setError(err.message);
        setLoading(false);
      });
  }, [selectedCategory, selectedTeam]);

  if (loading) {
    return (
      <div className="canvas-container-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading Possession Sequence Map for {selectedCategory} ({selectedTeam})...
      </div>
    );
  }

  if (error || !sequenceData) {
    return (
      <div className="canvas-container-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#f87171' }}>
          No possession sequence data precomputed for <strong>{selectedCategory}</strong> ({selectedTeam}).
        </p>
        <p style={{ fontSize: '0.75rem' }}>Select an action type with recorded instances from the sidebar.</p>
      </div>
    );
  }

  const progressions = sequenceData.progressions || [];
  const passes = sequenceData.passes || [];
  const instancesCount = sequenceData.instances_count || 0;

  return (
    <div className="canvas-container-card view-primary">
      <div className="view-card-header" style={{ justifyContent: 'space-between' }}>
        <span className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} color="#38bdf8" /> Possession Sequence Map — <strong style={{ textTransform: 'capitalize' }}>{selectedCategory.toLowerCase()}</strong>
          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: selectedTeam === 'Red Team' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.15)', color: selectedTeam === 'Red Team' ? '#ef4444' : '#ffffff', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Shield size={12} /> {selectedTeam}
          </span>
        </span>

        <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
          <span className="badge" style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            {instancesCount} Instances Overlaid
          </span>
          <span className="badge" style={{ backgroundColor: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
            {progressions.length} Carries
          </span>
          <span className="badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
            {passes.length} Passes
          </span>
        </div>
      </div>

      <div className="canvas-wrapper">
        <StaticPitchCanvas
          progressions={progressions}
          passes={passes}
          showProgressions={showProgressions}
          showPasses={showPasses}
          opacityScale={opacityScale}
          isSequenceMap={true}
          normalizedAttackDirection="Left to Right (LTR)"
          width={800}
          height={518}
        />
      </div>

      {/* Controls Bar for Possession Sequence Map */}
      <div style={{ padding: '12px 18px', backgroundColor: 'rgba(15, 17, 26, 0.9)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: showProgressions ? '#06b6d4' : 'var(--text-secondary)' }}>
            <input 
              type="checkbox" 
              checked={showProgressions} 
              onChange={e => setShowProgressions(e.target.checked)} 
            />
            <Footprints size={14} /> Carries Overlay ({progressions.length})
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

        {/* Opacity / Intensity Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <Sliders size={14} color="#38bdf8" />
          <span>Density Contrast:</span>
          <input 
            type="range"
            min={0.2}
            max={2.5}
            step={0.1}
            value={opacityScale}
            onChange={e => setOpacityScale(parseFloat(e.target.value))}
            style={{ width: '100px', cursor: 'pointer' }}
          />
          <span style={{ color: 'white', fontWeight: 600, width: '32px' }}>{opacityScale.toFixed(1)}x</span>
        </div>
      </div>
    </div>
  );
}

export default PossessionSequenceMapCard;
