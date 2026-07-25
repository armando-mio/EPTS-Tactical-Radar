import { useState, useEffect } from 'react';
import StaticPitchCanvas from './StaticPitchCanvas';
import { X, Layers, Footprints, ArrowRightLeft, Shield, GitMerge, Compass, Activity } from 'lucide-react';

function slugify(text) {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '_');
}

function PossessionSequenceMapModal({ category, team, onClose }) {
  const [sequenceData, setSequenceData] = useState(null);
  const [viewMode, setViewMode] = useState('flow'); // 'flow' | 'vectors'
  const [showProgressions, setShowProgressions] = useState(true);
  const [showPasses, setShowPasses] = useState(true);
  const [topChannels, setTopChannels] = useState([]);
  const [tacticalSummary, setTacticalSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!category || !team) return;

    setLoading(true);
    setError(null);
    setShowProgressions(true);
    setShowPasses(true);

    const catSlug = slugify(category);
    const teamSlug = slugify(team);

    // Try loading precomputed file first, fallback to aggregated json key
    fetch(`/data/possession_map_${catSlug}_${teamSlug}.json`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not precomputed');
      })
      .then(data => {
        setSequenceData(data);
        setLoading(false);
      })
      .catch(() => {
        // Fallback to action_types_aggregated.json
        fetch('/data/action_types_aggregated.json')
          .then(res => res.json())
          .then(aggData => {
            const key = `${team}___${category}`;
            const found = aggData[key];
            if (found) {
              setSequenceData({
                team: found.team,
                code: found.code,
                instances_count: found.total_clips || 0,
                passes: found.passes || [],
                progressions: found.progressions || []
              });
            } else {
              setError(`No cumulative sequence data found for ${category} (${team})`);
            }
            setLoading(false);
          })
          .catch(err => {
            console.error(err);
            setError(`Error loading cumulative sequence data.`);
            setLoading(false);
          });
      });
  }, [category, team]);

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const progressions = sequenceData?.progressions || [];
  const passes = sequenceData?.passes || [];
  const instancesCount = sequenceData?.instances_count || 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="modal-icon-badge">
              <Layers size={20} color="#38bdf8" />
            </div>
            <div>
              <h3 className="modal-title">Possession Sequence Map</h3>
              <p className="modal-subtitle">
                <span className="category-tag">{category}</span>
                <span className={`team-tag ${team === 'Red Team' ? 'red' : 'white'}`}>
                  <Shield size={12} /> {team === 'Red Team' ? 'Red Team' : 'White Team'}
                </span>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

            <button className="modal-close-btn" onClick={onClose} title="Close (ESC)">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {loading ? (
            <div className="modal-loading">
              <div className="spinner"></div>
              <span>Loading Possession Sequence Map...</span>
            </div>
          ) : error || !sequenceData ? (
            <div className="modal-error">
              <p>{error || 'Data not available.'}</p>
            </div>
          ) : (
            <>
              {/* Pitch Canvas Container (Expanded size) */}
              <div className="modal-canvas-wrapper">
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
                  width={1000}
                  height={648}
                />
              </div>

              {/* Metrics & Layer Selection Bar */}
              <div className="modal-controls-bar">
                <div className="modal-metrics">
                  <div className="metric-pill">
                    <span className="metric-label">Total Instances:</span>
                    <strong className="metric-val text-sky">{instancesCount}</strong>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Carries:</span>
                    <strong className="metric-val text-green">{progressions.length}</strong>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Passes:</span>
                    <strong className="metric-val text-purple">{passes.length}</strong>
                  </div>
                </div>

                {/* Layer Selector Pill Buttons */}
                <div className="modal-toggles">
                  <button
                    type="button"
                    className={`filter-pill-btn green ${showProgressions ? 'active' : ''}`}
                    onClick={() => setShowProgressions(prev => !prev)}
                  >
                    <span className="pill-dot green"></span>
                    <Footprints size={14} /> Carries ({progressions.length})
                  </button>
                  <button
                    type="button"
                    className={`filter-pill-btn purple ${showPasses ? 'active' : ''}`}
                    onClick={() => setShowPasses(prev => !prev)}
                  >
                    <span className="pill-dot purple"></span>
                    <ArrowRightLeft size={14} /> Passes ({passes.length})
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PossessionSequenceMapModal;
