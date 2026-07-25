import { useState, useEffect } from 'react';
import StaticPitchCanvas from './StaticPitchCanvas';
import { Layers, Footprints, ArrowRightLeft, Shield, GitMerge, Compass, Activity } from 'lucide-react';

function slugify(text) {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '_');
}

function PossessionSequenceMapCard({ selectedCategory, selectedTeam }) {
  const [sequenceData, setSequenceData] = useState(null);
  const [viewMode, setViewMode] = useState('flow'); // 'flow' | 'heatmap' | 'vectors'
  const [showProgressions, setShowProgressions] = useState(true);
  const [showPasses, setShowPasses] = useState(true);
  const [topChannels, setTopChannels] = useState([]);
  const [tacticalSummary, setTacticalSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!selectedCategory || !selectedTeam) return;

    const catSlug = slugify(selectedCategory);
    const teamSlug = slugify(selectedTeam);
    const filename = `/data/possession_map_${catSlug}_${teamSlug}.json`;

    setLoading(true);
    setError(null);
    setShowProgressions(true);
    setShowPasses(true);

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
        Loading Possession Map for {selectedCategory} ({selectedTeam})...
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
      <div className="view-card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <span className="view-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} color="#38bdf8" /> Possession Sequence Map — <strong style={{ textTransform: 'capitalize' }}>{selectedCategory.toLowerCase()}</strong>
          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: selectedTeam === 'Red Team' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.15)', color: selectedTeam === 'Red Team' ? '#ef4444' : '#ffffff', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Shield size={12} /> {selectedTeam}
          </span>
        </span>

        {/* View Mode Segmented Selector */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'rgba(15, 23, 42, 0.8)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            className={`mode-tab-btn ${viewMode === 'flow' ? 'active' : ''}`}
            onClick={() => setViewMode('flow')}
            title="Display main tactical corridors"
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <GitMerge size={14} /> Dominant Flows
          </button>
          <button
            type="button"
            className={`mode-tab-btn ${viewMode === 'vectors' ? 'active' : ''}`}
            onClick={() => setViewMode('vectors')}
            title="All individual vectors"
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Compass size={14} /> All Vectors
          </button>
        </div>
      </div>

      {/* Tactical Summary Banner */}
      {viewMode === 'flow' && tacticalSummary && (
        <div style={{ padding: '8px 14px', backgroundColor: 'rgba(56, 189, 248, 0.08)', borderBottom: '1px solid rgba(56, 189, 248, 0.18)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#f1f5f9' }}>
          <Activity size={14} color="#38bdf8" />
          <span style={{ color: '#38bdf8', fontWeight: 700 }}>Summary:</span>
          <span>{tacticalSummary}</span>
        </div>
      )}

      <div className="canvas-wrapper">
        <StaticPitchCanvas
          progressions={progressions}
          passes={passes}
          showProgressions={showProgressions}
          showPasses={showPasses}
          viewMode={viewMode}
          minFrequency={1}
          onTopChannelsCalculated={setTopChannels}
          onTacticalSummaryCalculated={setTacticalSummary}
          isSequenceMap={true}
          normalizedAttackDirection="Left to Right (LTR)"
          width={800}
          height={518}
        />
      </div>

      {/* Controls Bar for Possession Sequence Map */}
      <div style={{ padding: '12px 18px', backgroundColor: 'rgba(15, 17, 26, 0.9)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            className={`filter-pill-btn green ${showProgressions ? 'active' : ''}`}
            onClick={() => setShowProgressions(prev => !prev)}
          >
            <span className="pill-dot green"></span>
            <Footprints size={14} /> Carries Overlay ({progressions.length})
          </button>
          <button
            type="button"
            className={`filter-pill-btn purple ${showPasses ? 'active' : ''}`}
            onClick={() => setShowPasses(prev => !prev)}
          >
            <span className="pill-dot purple"></span>
            <ArrowRightLeft size={14} /> Pass Vectors ({passes.length})
          </button>
        </div>
      </div>
    </div>
  );
}

export default PossessionSequenceMapCard;
