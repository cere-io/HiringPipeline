'use client';

import React, { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [candidateId, setCandidateId] = useState('');
  const [role, setRole] = useState('Principal Software Engineer');
  const [resumeText, setResumeText] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  
  // Advanced logging state
  const [terminalLogs, setTerminalLogs] = useState<{time: string, type: 'network'|'agent'|'cubby'|'system', message: string}[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [roles, setRoles] = useState<string[]>(['Principal Software Engineer', 'AI Innovator']);
  const [activeStep, setActiveStep] = useState(1);
  const [latestCandidate, setLatestCandidate] = useState<string | null>(null);
  const [isDistilling, setIsDistilling] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [humanScore, setHumanScore] = useState<number | null>(null);
  const [humanFeedback, setHumanFeedback] = useState('');
  const [humanReasons, setHumanReasons] = useState<string[]>([]);
  const [currentReason, setCurrentReason] = useState('');
  const [distillScore, setDistillScore] = useState<number | null>(null);
  const [distillFeedback, setDistillFeedback] = useState('');
  const [distillReasons, setDistillReasons] = useState<string[]>([]);
  const [currentDistillReason, setCurrentDistillReason] = useState('');
  const [interviewTranscript, setInterviewTranscript] = useState('');
  const [isAnalyzingInterview, setIsAnalyzingInterview] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [previousWeights, setPreviousWeights] = useState<Record<string, number> | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [interviewReasons, setInterviewReasons] = useState<string[]>([]);
  const [currentInterviewReason, setCurrentInterviewReason] = useState('');
  const [interviewHumanScore, setInterviewHumanScore] = useState<number | null>(null);
  const [isSubmittingInterviewReview, setIsSubmittingInterviewReview] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'impact' | 'signals' | 'candidates'>('profile');
  const [gateDecision, setGateDecision] = useState<'advance' | 'reject' | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<string[]>([]);
  const [currentRejectionReason, setCurrentRejectionReason] = useState('');
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [radarMode, setRadarMode] = useState<'aggregate' | 'candidate'>('aggregate');
  const [radarCandidate, setRadarCandidate] = useState<string | null>(null);
  const [radarCompare, setRadarCompare] = useState<'winners' | 'rejects' | string>('winners');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateRoleFilter, setCandidateRoleFilter] = useState<string>('all');
  const [isSyncingJoin, setIsSyncingJoin] = useState(false);
  const [syncResult, setSyncResult] = useState<{ processed: number; message?: string } | null>(null);

  const addLog = (type: 'network'|'agent'|'cubby'|'system', message: string) => {
    setTerminalLogs(prev => [...prev, { time: new Date().toISOString().split('T')[1].slice(0, -1), type, message }]);
  };

  const fetchData = async () => {
    const res = await fetch('/api/data');
    const json = await res.json();
    setData(json);
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/notion/roles');
      const json = await res.json();
      if (json.roles && json.roles.length > 0) {
        setRoles(json.roles);
        setRole(json.roles[0]); 
      }
    } catch (e) {
      console.error("Failed to load dynamic roles");
    }
  };

  useEffect(() => {
    fetchData();
    fetchRoles();
    addLog('system', 'UI Initialized. Connecting to mock DDC Event Runtime...');
    addLog('network', 'GET /api/data - Fetching initial Cubby states');
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setActiveStep(2);
    
    addLog('system', `Webhook received from ATS. Processing ${candidateId}...`);

    // Step 1: Extract traits (separate call to stay under Vercel 10s timeout)
    addLog('network', `POST /api/pipeline/extract — Extracting traits for ${candidateId}`);
    const extractRes = await fetch('/api/pipeline/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, role, resumeText })
    });
    const extractResult = await extractRes.json();

    if (extractResult.logs) {
      extractResult.logs.forEach((l: string) => addLog('agent', l));
    }

    if (!extractResult.success) {
      addLog('system', `Trait extraction failed: ${extractResult.error || 'Unknown error'}`);
      setLoading(false);
      setActiveStep(1);
      await fetchData();
      return;
    }

    addLog('cubby', `[WRITE] hiring-traits/${candidateId} = ${JSON.stringify(extractResult.traits)}`);

    // Step 2: Score candidate (separate call, passes traits to avoid cubby miss)
    addLog('network', `POST /api/pipeline/score — Scoring ${candidateId}`);
    const scoreRes = await fetch('/api/pipeline/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, role, traits: extractResult.traits })
    });
    const scoreResult = await scoreRes.json();

    if (scoreResult.logs) {
      scoreResult.logs.forEach((l: string) => addLog('agent', l));
    }

    if (!scoreResult.success) {
      addLog('system', `Scoring failed: ${scoreResult.error || 'Unknown error'}`);
      setLoading(false);
      setActiveStep(1);
      await fetchData();
      return;
    }

    addLog('cubby', `[WRITE] hiring-scores/${candidateId} = ${JSON.stringify(scoreResult.score)}`);

    // Inject results directly into client state so step 3 renders immediately
    setData((prev: any) => ({
      ...prev,
      traits: { ...(prev?.traits || {}), [`/${candidateId}`]: extractResult.traits },
      scores: { ...(prev?.scores || {}), [`/${candidateId}`]: scoreResult.score },
      statuses: { ...(prev?.statuses || {}), [`/${candidateId}`]: { candidate_id: candidateId, role, stage: 'ai_scored', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } },
    }));

    setLatestCandidate(candidateId);
    setLoading(false);
    setActiveStep(3);
    setCandidateId('');
    setResumeText('');

    fetchData().catch(() => {});
  };

  const handleInterviewWebhook = async (cid: string, cRole: string) => {
    const mockTranscript = `Interviewer: Tell me about a time you designed a scalable architecture.
Candidate: At my last job, I designed a microservices architecture using Node.js and Redis that scaled to 10M DAU. We had to carefully manage our Cubby state...
Interviewer: How do you handle disagreements on technical choices?
Candidate: I try to be very clear in my communication and rely on data-driven ADRs to make decisions.`;
    setIsAnalyzingInterview(true);
    addLog('system', `Email Poller Webhook simulated. Ingesting Interview Transcript for ${cid}`);
    addLog('network', `POST /api/webhooks/interview - Payload: { candidateId: "${cid}", transcriptLength: ${mockTranscript.length} }`);
    const res = await fetch('/api/webhooks/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: cid, role: cRole, transcriptText: mockTranscript })
    });
    const result = await res.json();
    if (result.logs) result.logs.forEach((l: string) => addLog('agent', l));
    if (result.analysis) {
      addLog('cubby', `[WRITE] hiring-interviews/${cid} = ${JSON.stringify(result.analysis)}`);
      setData((prev: any) => ({ ...prev, interviews: { ...(prev?.interviews || {}), [`/${cid}`]: result.analysis } }));
    }
    setIsAnalyzingInterview(false);
    setActiveStep(4);
    fetchData().catch(() => {});
  };

  const handleInterview = async (cid: string, cRole: string) => {
    const transcript = interviewTranscript.trim();
    if (!transcript) return;

    setIsAnalyzingInterview(true);
    addLog('system', `Manual Interview Transcript submitted for analysis: ${cid}`);
    addLog('network', `POST /api/webhooks/interview - Payload: { candidateId: "${cid}", transcriptLength: ${transcript.length} }`);
    
    const res = await fetch('/api/webhooks/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: cid, role: cRole, transcriptText: transcript })
    });
    
    const result = await res.json();
    
    if (result.logs) {
      result.logs.forEach((l: string) => addLog('agent', l));
    }
    
    if (result.analysis) {
      addLog('cubby', `[WRITE] hiring-interviews/${cid} = ${JSON.stringify(result.analysis)}`);
      setData((prev: any) => ({ ...prev, interviews: { ...(prev?.interviews || {}), [`/${cid}`]: result.analysis } }));
    }

    setIsAnalyzingInterview(false);
    setInterviewTranscript('');
    setActiveStep(4);
    fetchData().catch(() => {});
  };

  const handleOutcome = async (cid: string, cRole: string, outcome: number, feedback?: string, reasons?: string[]) => {
    setIsSubmittingReview(true);
    addLog('system', `Human Review submitted. Score: ${outcome}/10 for ${cid} | ${(reasons || []).length} trait reasons${feedback ? ` | Feedback: "${feedback.slice(0, 100)}"` : ''}`);
    addLog('network', `POST /api/distill - Payload: { candidateId: "${cid}", outcome: ${outcome}, reasons: ${(reasons || []).length} }`);

    const weightsBeforeKey = `/trait_weights/${cRole}`;
    const weightsBefore = data?.meta?.[weightsBeforeKey] ? { ...data.meta[weightsBeforeKey] } : null;
    setPreviousWeights(weightsBefore);
    
    const res = await fetch('/api/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: cid, role: cRole, outcome, feedback: feedback || undefined, reasons: reasons || [], source: cid.split('-')[0] || 'direct', isPerformanceReview: false })
    });

    const result = await res.json();
    
    if (result.logs) {
      result.logs.forEach((l: string) => addLog('agent', l));
    }
    
    addLog('cubby', `[WRITE] hiring-outcomes/${cid} = { outcome: ${outcome}${feedback ? `, feedback: "${feedback.slice(0, 80)}"` : ''}, timestamp: "${new Date().toISOString()}" }`);
    addLog('cubby', `[WRITE] hiring-traits/${cid} → human_feedback_score: ${outcome}`);
    if (feedback) {
      addLog('agent', `Human reasoning fed to Gemini distillation: "${feedback.slice(0, 120)}"`);
    }
    if (result.new_weights) {
      addLog('cubby', `[WRITE] hiring-meta/trait_weights/${cRole} = ${JSON.stringify(result.new_weights)}`);
      addLog('system', `Compound Intelligence cycle complete. Weights updated for ${cRole}${feedback ? ' (with human reasoning)' : ''}.`);
    }

    // Update local state with outcome so next steps render
    setData((prev: any) => ({
      ...prev,
      outcomes: { ...(prev?.outcomes || {}), [`/${cid}`]: { outcome, feedback, reasons, timestamp: new Date().toISOString() } },
      ...(result.new_weights ? { meta: { ...(prev?.meta || {}), [`/trait_weights/${cRole}`]: result.new_weights } } : {}),
    }));

    setIsSubmittingReview(false);
    setHumanScore(null);
    setHumanFeedback('');
    setHumanReasons([]);
    setCurrentReason('');
    setInterviewTranscript('');
    setGateDecision(null);
    setRejectionReasons([]);
    setActiveStep(3.75 as any);

    fetchData().catch(() => {});
  };

  const handleDistill = async (cid: string, cRole: string, performanceScore: number, feedback?: string, reasons?: string[]) => {
    if (isDistilling) return;
    setIsDistilling(true);
    addLog('system', `1 Month Later — Performance Review triggered for ${cid} | ${(reasons || []).length} trait reasons${feedback ? ` | Manager feedback: "${feedback.slice(0, 100)}"` : ''}`);
    addLog('network', `POST /api/distill - Payload: { candidateId: "${cid}", outcome: ${performanceScore}, reasons: ${(reasons || []).length} }`);
    
    const res = await fetch('/api/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: cid, role: cRole, outcome: performanceScore, feedback: feedback || undefined, reasons: reasons || [], source: cid.split('-')[0] || 'direct', isPerformanceReview: true })
    });

    const result = await res.json();
    
    if (result.logs) {
      result.logs.forEach((l: string) => addLog('agent', l));
    }

    addLog('cubby', `[WRITE] hiring-outcomes/${cid} = { outcome: ${performanceScore}${feedback ? `, feedback: "${feedback.slice(0, 80)}"` : ''}, timestamp: "${new Date().toISOString()}" }`);
    addLog('cubby', `[WRITE] hiring-traits/${cid} → human_feedback_score: ${performanceScore}`);
    if (feedback) {
      addLog('agent', `Manager reasoning fed to Gemini distillation: "${feedback.slice(0, 120)}"`);
    }
    if (result.new_weights) {
      addLog('cubby', `[WRITE] hiring-meta/trait_weights/${cRole} = ${JSON.stringify(result.new_weights)}`);
      addLog('system', `Compound Intelligence cycle complete. Weights updated for ${cRole}${feedback ? ' (with manager reasoning)' : ''}.`);
    }

    setData((prev: any) => ({
      ...prev,
      outcomes: { ...(prev?.outcomes || {}), [`/${cid}`]: { outcome: performanceScore, feedback, reasons, is_performance_review: true, timestamp: new Date().toISOString() } },
      ...(result.new_weights ? { meta: { ...(prev?.meta || {}), [`/trait_weights/${cRole}`]: result.new_weights } } : {}),
    }));
    setIsDistilling(false);
    setDistillScore(null);
    setDistillFeedback('');
    setDistillReasons([]);
    setCurrentDistillReason('');
    setActiveStep(6 as any);
    fetchData().catch(() => {});
  };

  const handleInterviewReview = async (cid: string, cRole: string) => {
    if (!interviewHumanScore || interviewReasons.length < 2) return;
    setIsSubmittingInterviewReview(true);
    addLog('system', `Interview Review submitted. Score: ${interviewHumanScore}/10 for ${cid} | ${interviewReasons.length} trait reasons`);
    
    const res = await fetch('/api/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: cid, role: cRole, outcome: interviewHumanScore, reasons: interviewReasons, source: cid.split('-')[0] || 'direct', isPerformanceReview: false })
    });
    const result = await res.json();
    if (result.logs) result.logs.forEach((l: string) => addLog('agent', l));
    
    setIsSubmittingInterviewReview(false);
    setInterviewHumanScore(null);
    setInterviewReasons([]);
    setCurrentInterviewReason('');
    setGateDecision(null);
    setRejectionReasons([]);
    fetchData().catch(() => {});
    setActiveStep(4.5 as any);
  };

  const handleGateDecision = async (cid: string, decision: 'advance' | 'reject', nextStep: number) => {
    setIsAdvancing(true);
    try {
      const res = await fetch('/api/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: cid, decision, reasons: decision === 'reject' ? rejectionReasons : undefined })
      });
      const result = await res.json();
      if (result.success) {
        addLog('system', decision === 'advance'
          ? `Candidate ${cid} advanced to next stage`
          : `Candidate ${cid} REJECTED — reasons: ${rejectionReasons.join(', ')}`);

        // Update local state directly so UI transitions without waiting for fetchData
        const newStage = result.status?.stage;
        if (newStage) {
          setData((prev: any) => ({
            ...prev,
            statuses: { ...(prev?.statuses || {}), [`/${cid}`]: result.status },
          }));
        }

        if (decision === 'advance') {
          setActiveStep(nextStep);
        } else {
          setActiveStep(1);
          setLatestCandidate(null);
        }

        // Background refresh — don't block UI
        fetchData().catch(() => {});
      } else {
        addLog('system', `Gate decision failed: ${result.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      addLog('system', `Gate decision error: ${e.message}`);
    }
    setIsAdvancing(false);
    setGateDecision(null);
    setRejectionReasons([]);
    setCurrentRejectionReason('');
  };

  const traitLabel = (dimKey: string, value: string, isBool: boolean): string => {
    const labels: Record<string, Record<string, string>> = {
      education_level: { Masters: "Master's degree", Bachelors: "Bachelor's degree", PhD: 'PhD holder', None: 'No formal degree' },
      school_tier: { tier_1: 'Top-tier university (MIT, Stanford, IIT...)', tier_2: 'Strong regional university', tier_3: 'Average/other university', unknown: 'University not identified' },
      school_geography: { us: 'Studied in the US', europe: 'Studied in Europe', asia: 'Studied in Asia', other: 'Studied elsewhere' },
      field_of_study: { cs: 'Computer Science degree', engineering: 'Engineering degree', science: 'Science degree', business: 'Business degree', other: 'Other field of study' },
      schools_bucket: { high: 'Prestigious school (7+ rating)', mid: 'Average school (4-6 rating)', low: 'Low-rated school (0-3 rating)' },
      yoe_bucket: { '0-2': '0-2 years experience', '3-5': '3-5 years experience', '6-10': '6-10 years experience', '10+': '10+ years experience' },
      hard_things_bucket: { high: 'Strong track record of hard things done', mid: 'Some notable achievements', low: 'Few notable achievements' },
      career_trajectory: { startup_first: 'Started career in startups', bigtech_first: 'Started career in big tech', mixed: 'Mixed startup & corporate career', enterprise_only: 'Only enterprise/corporate experience' },
      primary_tech_domain: { systems: 'Systems & infrastructure engineer', web: 'Web/frontend engineer', data_ml: 'Data/ML engineer', mobile: 'Mobile engineer', infra: 'Infrastructure/DevOps', fullstack: 'Full-stack engineer' },
      company_tier: { faang: 'Worked at FAANG', tier_1_tech: 'Worked at top-tier tech company', funded_startup: 'Worked at funded startup', enterprise: 'Enterprise/corporate background', other: 'Other company background' },
    };
    const boolLabels: Record<string, [string, string]> = {
      has_startup: ['Has startup experience', 'No startup experience'],
      has_growth_stage: ['Has growth-stage experience', 'No growth-stage experience'],
      has_bigtech: ['Has big tech experience', 'No big tech experience'],
      has_open_source: ['Has open source contributions', 'No open source contributions'],
      has_hackathons: ['Has hackathon participation', 'No hackathon participation'],
      has_hard_things: ['Built impressive things (6+ rating)', 'No standout projects'],
    };
    if (dimKey.startsWith('merged_')) return value;
    if (isBool && boolLabels[dimKey]) return value === 'true' ? boolLabels[dimKey][0] : boolLabels[dimKey][1];
    if (labels[dimKey]?.[value]) return labels[dimKey][value];
    if (isBool) return value === 'true' ? dimKey.replace(/^has_/, '').replace(/_/g, ' ') : `No ${dimKey.replace(/^has_/, '').replace(/_/g, ' ')}`;
    return `${dimKey.replace(/_/g, ' ')}: ${value.replace(/_/g, ' ')}`;
  };

  const renderAdvanceRejectButtons = (cid: string, stageName: string, nextStep: number) => (
    <div className="space-y-3 mt-4">
      {gateDecision === 'reject' ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold text-red-900">Rejecting {data?.traits?.[`/${cid}`]?.candidate_name || cid}</div>
          <p className="text-xs text-red-700">Optionally add reasons for rejection. Press Enter to add each reason.</p>
          {renderReasonInput(rejectionReasons, setRejectionReasons, currentRejectionReason, setCurrentRejectionReason, isAdvancing,
            'Reason for rejection (optional) — Press Enter to add', 'red')}
          <div className="flex gap-2">
            <button onClick={() => { setGateDecision(null); setRejectionReasons([]); }}
              className="flex-1 bg-white border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-50">
              Cancel
            </button>
            <button disabled={isAdvancing}
              onClick={() => handleGateDecision(cid, 'reject', nextStep)}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              {isAdvancing ? 'Processing...' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button disabled={isAdvancing}
            onClick={() => handleGateDecision(cid, 'advance', nextStep)}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-40">
            {isAdvancing ? 'Processing...' : `Proceed to ${stageName}`}
          </button>
          <button disabled={isAdvancing}
            onClick={() => setGateDecision('reject')}
            className="px-4 py-3 bg-white border-2 border-red-300 text-red-600 font-semibold rounded-lg text-sm hover:bg-red-50 disabled:opacity-40">
            Reject
          </button>
        </div>
      )}
    </div>
  );

  const renderReasonInput = (
    reasons: string[],
    setReasons: (r: string[]) => void,
    currentValue: string,
    setCurrentValue: (v: string) => void,
    disabled: boolean,
    placeholder: string,
    accentColor: string
  ) => (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
        Trait-Level Reasons <span className={reasons.length >= 2 ? 'text-green-600' : 'text-red-500'}>({reasons.length}/2 minimum)</span>
      </div>
      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reasons.map((r, i) => (
            <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-${accentColor}-100 text-${accentColor}-800 border border-${accentColor}-200`}>
              {r}
              <button type="button" onClick={() => setReasons(reasons.filter((_, j) => j !== i))} disabled={disabled}
                className="hover:text-red-600 ml-0.5 font-bold">&times;</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input type="text" value={currentValue} onChange={e => setCurrentValue(e.target.value)} disabled={disabled}
          placeholder={placeholder}
          onKeyDown={e => {
            if (e.key === 'Enter' && currentValue.trim()) {
              e.preventDefault();
              setReasons([...reasons, currentValue.trim()]);
              setCurrentValue('');
            }
          }}
          className={`flex-1 p-2.5 text-sm border border-${accentColor}-200 rounded-lg outline-none focus:ring-2 focus:ring-${accentColor}-400 disabled:opacity-40`} />
        <button type="button" disabled={disabled || !currentValue.trim()}
          onClick={() => { if (currentValue.trim()) { setReasons([...reasons, currentValue.trim()]); setCurrentValue(''); } }}
          className={`px-3 py-2 text-sm font-semibold rounded-lg bg-${accentColor}-100 text-${accentColor}-700 hover:bg-${accentColor}-200 disabled:opacity-40 disabled:cursor-not-allowed`}>
          Add
        </button>
      </div>
      {reasons.length < 2 && (
        <p className="text-xs text-red-500 italic">Add at least {2 - reasons.length} more reason{2 - reasons.length > 1 ? 's' : ''} to submit. Be specific about which traits drove your score.</p>
      )}
    </div>
  );

  const renderTraits = (traits: any) => {
    if (!traits) return null;
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">YOE</div><div className="font-semibold text-gray-900">{traits.years_of_experience}</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Education</div><div className="font-semibold text-gray-900">{traits.education_level}</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Skills Found</div><div className="font-semibold text-gray-900">{traits.skills?.length || 0}</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Schools</div><div className="font-semibold text-gray-900">{traits.schools?.rating}/10</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Hard Things</div><div className="font-semibold text-gray-900">{traits.hard_things_done?.rating}/10</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Hackathons</div><div className="font-semibold text-gray-900">{traits.hackathons?.rating}/10</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">OSS</div><div className="font-semibold text-gray-900">{traits.open_source_contributions?.rating}/10</div></div>
        <div className="bg-gray-50 p-2 rounded border border-gray-100"><div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Signals</div><div className="font-semibold text-gray-900">{traits.company_signals?.rating}/10</div></div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="bg-white border-b px-8 py-4 shadow-sm flex-shrink-0 z-10">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
              Cere Hiring Intelligence
            </h1>
            <p className="text-sm text-slate-500 mt-1">Compound Intelligence & Agent Orchestration Demo</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={isSyncingJoin}
              onClick={async () => {
                setIsSyncingJoin(true);
                setSyncResult(null);
                addLog('network', 'POST /api/cron/join-poll — Syncing new candidates from Join...');
                try {
                  const res = await fetch('/api/cron/join-poll');
                  const json = await res.json();
                  setSyncResult({ processed: json.processed || 0, message: json.message });
                  addLog('system', json.processed > 0
                    ? `Synced ${json.processed} new candidate(s) from Join`
                    : json.message || 'No new candidates on Join');
                  if (json.processed > 0) fetchData();
                } catch (e: any) {
                  addLog('system', `Join sync failed: ${e.message}`);
                  setSyncResult({ processed: 0, message: 'Sync failed' });
                }
                setIsSyncingJoin(false);
                setTimeout(() => setSyncResult(null), 5000);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${isSyncingJoin ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-wait' : 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'}`}
            >
              {isSyncingJoin ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> Syncing...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Sync from Join</>
              )}
            </button>
            {syncResult && (
              <span className={`text-xs font-medium ${syncResult.processed > 0 ? 'text-green-600' : 'text-slate-500'}`}>
                {syncResult.processed > 0 ? `${syncResult.processed} new candidate${syncResult.processed > 1 ? 's' : ''} added` : syncResult.message || 'No new candidates'}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col overflow-hidden max-w-7xl mx-auto w-full p-8 gap-6">

        {/* Candidate Queue */}
        {data?.statuses && Object.keys(data.statuses).length > 0 && (() => {
          const statusEntries = Object.entries(data.statuses).map(([key, s]: [string, any]) => ({ cid: key.replace(/^\//, ''), ...s }));
          const stageGroups: Record<string, typeof statusEntries> = {};
          for (const s of statusEntries) {
            const g = s.stage || 'unknown';
            if (!stageGroups[g]) stageGroups[g] = [];
            stageGroups[g].push(s);
          }
          const stageOrder = ['ai_scored', 'human_review', 'interview', 'hired', 'performance_review', 'rejected'];
          const stageLabels: Record<string, string> = { ai_scored: 'Pending Review', human_review: 'In Review', interview: 'Interview', hired: 'Hired', performance_review: 'Performance', rejected: 'Rejected' };
          const stageColors: Record<string, string> = { ai_scored: 'bg-yellow-100 text-yellow-800 border-yellow-300', human_review: 'bg-indigo-100 text-indigo-800 border-indigo-300', interview: 'bg-teal-100 text-teal-800 border-teal-300', hired: 'bg-green-100 text-green-800 border-green-300', performance_review: 'bg-blue-100 text-blue-800 border-blue-300', rejected: 'bg-red-100 text-red-800 border-red-300' };

          return (
            <div className="flex-shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  <span className="font-bold text-slate-800 text-sm">Candidate Pipeline</span>
                  <span className="text-xs text-slate-400">{statusEntries.length} total</span>
                </div>
                <div className="flex gap-2">
                  {stageOrder.map(stage => {
                    const count = (stageGroups[stage] || []).length;
                    if (count === 0) return null;
                    return (
                      <span key={stage} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${stageColors[stage] || 'bg-slate-100 text-slate-600'}`}>
                        {stageLabels[stage] || stage} ({count})
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {statusEntries.sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage)).map(s => {
                  const score = data.scores?.[`/${s.cid}`]?.composite_score;
                  const traits = data.traits?.[`/${s.cid}`];
                  const pillName = traits?.candidate_name || s.cid;
                  const isActive = latestCandidate === s.cid;
                  return (
                    <button key={s.cid}
                      onClick={() => {
                        setLatestCandidate(s.cid);
                        setGateDecision(null);
                        setRejectionReasons([]);
                        const stageToStep: Record<string, number> = { ai_scored: 3, human_review: 3.5, interview: 4, hired: 5, performance_review: 6, rejected: 1 };
                        setActiveStep(stageToStep[s.stage] ?? 1);
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'}`}>
                      <span className="font-semibold">{pillName}</span>
                      {score != null && <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${isActive ? 'bg-blue-500' : score >= 70 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{score.toFixed(0)}</span>}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isActive ? 'bg-blue-500' : stageColors[s.stage]?.replace('border-', 'border ') || 'bg-slate-100'}`}>
                        {s.stage === 'rejected' ? 'REJ' : stageLabels[s.stage]?.slice(0, 3).toUpperCase() || s.stage}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Top Half: Process Stepper & Weights */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-shrink-0">
          
          {/* Left: The Pipeline Stepper */}
          <div className="lg:col-span-7 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap hide-scrollbar">
              {[
                { step: 1, label: 'Apply' },
                { step: 2, label: 'AI Score' },
                { step: 3.5, label: 'Human Review' },
                { step: 4, label: 'Interview' },
                { step: 5, label: 'Distill' },
                { step: 6, label: 'Done' },
              ].map(({ step, label }, i) => (
                <React.Fragment key={label}>
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs shrink-0 ${(activeStep as number) >= step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</div>
                  <span className={`text-xs font-semibold ${(activeStep as number) >= step ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
                  {i < 5 && <div className={`h-1 w-4 rounded shrink-0 ${(activeStep as number) > step ? 'bg-blue-600' : 'bg-slate-200'}`}></div>}
                </React.Fragment>
              ))}
            </div>

            <div className="p-6 relative overflow-y-auto">

              {/* STEP 1: Apply — form input */}
              {(activeStep === 1 || activeStep === 2) && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Candidate ID</label>
                      <input type="text" required value={candidateId} onChange={e => setCandidateId(e.target.value)} placeholder="e.g. join-8841" className="w-full p-2.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" disabled={loading} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Target Role (from Notion)</label>
                      <select value={role} onChange={e => setRole(e.target.value)} className="w-full p-2.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" disabled={loading}>
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Resume</label>
                    <div className="flex gap-2 mb-2">
                      <label className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded border cursor-pointer transition-colors ${uploadingPdf ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                        {uploadingPdf ? 'Extracting...' : 'Upload PDF'}
                        <input type="file" accept=".pdf" className="hidden" disabled={loading || uploadingPdf} onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingPdf(true);
                          const formData = new FormData();
                          formData.append('file', file);
                          try {
                            const res = await fetch('/api/upload', { method: 'POST', body: formData });
                            const json = await res.json();
                            if (json.text) setResumeText(json.text);
                          } catch (err) {
                            console.error('PDF upload failed:', err);
                          }
                          setUploadingPdf(false);
                          e.target.value = '';
                        }} />
                      </label>
                      <span className="text-xs text-slate-400 self-center">or paste text below</span>
                    </div>
                    <textarea required value={resumeText} onChange={e => setResumeText(e.target.value)} placeholder="Paste candidate's raw resume here..." rows={6} className="w-full p-3 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs resize-none" disabled={loading} />
                  </div>
                  <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded flex justify-center items-center gap-2 disabled:opacity-70">
                    {loading ? (<><svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Running Trait Extractor + Scorer...</>) : (<><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Simulate Join.com Webhook</>)}
                  </button>
                </form>
              )}

              {/* STEP 2: AI Score result */}
              {activeStep === 3 && latestCandidate && data?.scores?.[`/${latestCandidate}`] && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{data.traits?.[`/${latestCandidate}`]?.candidate_name || latestCandidate}</h3>
                      <p className="text-sm text-slate-500">{data.statuses?.[`/${latestCandidate}`]?.role || role}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 px-5 py-3 rounded-xl text-center">
                      <div className="text-xs text-blue-600 font-bold uppercase tracking-wide">AI Score</div>
                      <div className="text-4xl font-black text-blue-700 leading-none mt-1">
                        {data.scores[`/${latestCandidate}`].composite_score?.toFixed(1)}
                      </div>
                      <div className="text-xs text-blue-500 mt-0.5">/ 100</div>
                    </div>
                  </div>
                  {data.scores[`/${latestCandidate}`].reasoning && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">AI Reasoning</div>
                      <p className="text-sm text-slate-700 italic">{data.scores[`/${latestCandidate}`].reasoning}</p>
                    </div>
                  )}
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Extracted Traits — hiring-traits Cubby</div>
                  {renderTraits(data.traits[`/${latestCandidate}`])}
                  {renderAdvanceRejectButtons(latestCandidate, 'Human Review', 3.5 as any)}
                </div>
              )}

              {/* STEP 3: Human Review Score */}
              {activeStep === (3.5 as any) && latestCandidate && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Human Review</h3>
                    <p className="text-sm text-slate-500">Score this candidate 1-10 and provide <strong>at least 2 specific trait-level reasons</strong>. This feeds the Compound Intelligence.</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-4">
                    <div className="text-sm font-semibold text-indigo-900">How does <strong>{data?.traits?.[`/${latestCandidate}`]?.candidate_name || latestCandidate}</strong> look to you?</div>
                    <div className="flex gap-1.5">
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button key={n} disabled={isSubmittingReview} onClick={() => setHumanScore(n)}
                          className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${humanScore === n
                            ? n >= 8 ? 'bg-green-600 text-white ring-2 ring-green-400' : n >= 5 ? 'bg-yellow-500 text-white ring-2 ring-yellow-300' : 'bg-red-500 text-white ring-2 ring-red-300'
                            : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >{n}</button>
                      ))}
                    </div>
                    {renderReasonInput(humanReasons, setHumanReasons, currentReason, setCurrentReason, isSubmittingReview,
                      'e.g. "Went to underrated but strong engineering school" — press Enter to add', 'indigo')}
                    <textarea value={humanFeedback} onChange={e => setHumanFeedback(e.target.value)} disabled={isSubmittingReview}
                      placeholder="Optional: additional context or freeform feedback..."
                      rows={2} className="w-full p-3 border border-indigo-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none disabled:opacity-40" />
                    {isSubmittingReview && (
                      <div className="flex items-center gap-2 bg-indigo-100 border border-indigo-200 rounded-lg px-3 py-2">
                        <svg className="animate-spin w-4 h-4 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                        <span className="text-xs font-semibold text-indigo-800">Distillation Agent running — extracting signals & updating weights...</span>
                      </div>
                    )}
                    <button disabled={!humanScore || humanReasons.length < 2 || isSubmittingReview}
                      onClick={() => humanScore && handleOutcome(latestCandidate, role, humanScore, humanFeedback, humanReasons)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                      Submit Review {humanScore ? `(${humanScore}/10)` : ''} {humanReasons.length < 2 ? `— need ${2 - humanReasons.length} more reason${2 - humanReasons.length > 1 ? 's' : ''}` : ''}
                    </button>
                  </div>
                </div>
              )}

              {/* GATE: After Human Review, before Interview */}
              {activeStep === (3.75 as any) && latestCandidate && (
                <div className="space-y-4 animate-fade-in">
                  <h3 className="text-xl font-bold text-slate-900">Review Complete — Advance to Interview?</h3>
                  <p className="text-sm text-slate-500">Human review score: <strong>{data?.outcomes?.[`/${latestCandidate}`]?.outcome}/10</strong></p>
                  {renderAdvanceRejectButtons(latestCandidate, 'Interview', 4)}
                </div>
              )}

              {/* STEP 4: Interview Score */}
              {activeStep === 4 && latestCandidate && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Interview Analysis</h3>
                      <p className="text-sm text-slate-500">Ingest transcript from email webhook or paste manually.</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-lg text-center text-sm">
                      <div className="text-xs text-slate-500">Human Review</div>
                      <div className="font-bold text-indigo-700">{data?.outcomes?.[`/${latestCandidate}`]?.outcome}/10</div>
                    </div>
                  </div>

                  {isAnalyzingInterview && (
                    <div className="flex items-center gap-2 bg-teal-100 border border-teal-200 rounded-lg px-3 py-2">
                      <svg className="animate-spin w-4 h-4 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      <span className="text-xs font-semibold text-teal-800">Gemini 2.5 Flash is analyzing the transcript...</span>
                    </div>
                  )}

                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                    <div className="text-sm font-semibold text-teal-900 mb-2">Simulate HR-2026-E2E Email Scraper Webhook</div>
                    <p className="text-xs text-slate-500 mb-3">Simulates the email poller picking up an interview transcript and sending it to Gemini for semantic analysis across 4 dimensions.</p>
                    <button disabled={isAnalyzingInterview} onClick={() => handleInterviewWebhook(latestCandidate, role)}
                      className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                      Ingest from Email Webhook
                    </button>
                  </div>

                  <div className="relative flex items-center gap-3">
                    <div className="flex-1 border-t border-slate-200"></div>
                    <span className="text-xs text-slate-400 font-medium">or paste manually</span>
                    <div className="flex-1 border-t border-slate-200"></div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <textarea value={interviewTranscript} onChange={e => setInterviewTranscript(e.target.value)} disabled={isAnalyzingInterview}
                      placeholder="Paste interview transcript here..."
                      rows={4} className="w-full p-3 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-teal-400 resize-none mb-3 disabled:opacity-40" />
                    <button disabled={!interviewTranscript.trim() || isAnalyzingInterview} onClick={() => handleInterview(latestCandidate, role)}
                      className="w-full bg-slate-700 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                      Analyze Pasted Transcript
                    </button>
                  </div>

                  {/* Interviewer's trait-level feedback (after AI analysis is available) */}
                  {data?.interviews?.[`/${latestCandidate}`] && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
                      <div className="font-semibold text-orange-900 text-sm">Interviewer Feedback — Add Your Trait-Level Signals</div>
                      <p className="text-xs text-orange-700">The AI analyzed the transcript. Now confirm or dispute it with specific trait-level reasons (min 2). This feeds the Signal Catalog.</p>
                      <div className="flex gap-1.5">
                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                          <button key={n} disabled={isSubmittingInterviewReview} onClick={() => setInterviewHumanScore(n)}
                            className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${interviewHumanScore === n
                              ? n >= 8 ? 'bg-green-600 text-white ring-2 ring-green-400' : n >= 5 ? 'bg-yellow-500 text-white ring-2 ring-yellow-300' : 'bg-red-500 text-white ring-2 ring-red-300'
                              : 'bg-white border border-orange-200 text-slate-600 hover:border-orange-400'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                          >{n}</button>
                        ))}
                      </div>
                      {renderReasonInput(interviewReasons, setInterviewReasons, currentInterviewReason, setCurrentInterviewReason, isSubmittingInterviewReview,
                        'e.g. "Could not articulate scaling decisions clearly" — press Enter', 'orange')}
                      <button disabled={!interviewHumanScore || interviewReasons.length < 2 || isSubmittingInterviewReview}
                        onClick={() => handleInterviewReview(latestCandidate, role)}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                        Submit Interview Feedback {interviewHumanScore ? `(${interviewHumanScore}/10)` : ''} {interviewReasons.length < 2 ? `— need ${2 - interviewReasons.length} more reason${2 - interviewReasons.length > 1 ? 's' : ''}` : ''}
                      </button>
                      <div className="relative flex items-center gap-3">
                        <div className="flex-1 border-t border-orange-200"></div>
                        <button onClick={() => { setGateDecision(null); setRejectionReasons([]); setActiveStep(4.5 as any); }} className="text-xs text-orange-400 hover:text-orange-600 font-medium">Proceed to Hire Decision</button>
                        <div className="flex-1 border-t border-orange-200"></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* GATE: After Interview, before Hire/Distill */}
              {activeStep === (4.5 as any) && latestCandidate && (
                <div className="space-y-4 animate-fade-in">
                  <h3 className="text-xl font-bold text-slate-900">Interview Complete — Hire this candidate?</h3>
                  <p className="text-sm text-slate-500">Advancing means this candidate is hired and will proceed to 1-month performance review.</p>
                  {renderAdvanceRejectButtons(latestCandidate, 'Performance Review (Hired)', 5)}
                </div>
              )}

              {/* STEP 5: Distillation — 1 Month Performance Review */}
              {activeStep === 5 && latestCandidate && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Distill — 1 Month Later</h3>
                    <p className="text-sm text-slate-500">The candidate was hired. After 1 month, their manager submits a performance review. The Distillation Agent uses this to update the role weights.</p>
                  </div>

                  {/* Interview analysis recap */}
                  {data?.interviews?.[`/${latestCandidate}`] && (
                    <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                      <div className="font-semibold text-teal-800 text-sm mb-2">Interview Analysis (LLM)</div>
                      <p className="text-xs text-slate-600 italic mb-3">"{data.interviews[`/${latestCandidate}`].analysis?.summary}"</p>
                      <div className="grid grid-cols-4 gap-2">
                        {['technical_depth','communication_clarity','cultural_fit','problem_solving'].map(k => (
                          <div key={k} className="bg-white p-2 rounded border border-teal-200 text-center">
                            <div className="text-[10px] text-slate-500 uppercase leading-tight">{k.replace(/_/g,' ')}</div>
                            <div className="font-bold text-teal-700 text-lg">{data.interviews[`/${latestCandidate}`].analysis?.[k]}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 1 month performance review */}
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">⏩</span>
                      <div className="font-bold text-amber-900 text-sm">1 Month Later — How is the employee performing?</div>
                    </div>
                    <p className="text-xs text-amber-700">Provide a score and <strong>at least 2 trait-level reasons</strong>. This feeds back into the Distillation Agent.</p>
                    <div className="flex gap-1.5">
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button key={n} disabled={isDistilling} onClick={() => setDistillScore(n)}
                          className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${distillScore === n
                            ? n >= 8 ? 'bg-green-600 text-white ring-2 ring-green-400' : n >= 5 ? 'bg-yellow-500 text-white ring-2 ring-yellow-300' : 'bg-red-500 text-white ring-2 ring-red-300'
                            : 'bg-white border border-amber-200 text-slate-600 hover:border-amber-400'
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >{n}</button>
                      ))}
                    </div>
                    {renderReasonInput(distillReasons, setDistillReasons, currentDistillReason, setCurrentDistillReason, isDistilling,
                      'e.g. "Strong at autonomous problem-solving despite junior title" — press Enter', 'amber')}
                    <textarea value={distillFeedback} onChange={e => setDistillFeedback(e.target.value)} disabled={isDistilling}
                      placeholder="Optional: additional context on performance..."
                      rows={2} className="w-full p-3 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400 resize-none disabled:opacity-40" />
                    {isDistilling && (
                      <div className="flex items-center gap-2 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2">
                        <svg className="animate-spin w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                        <span className="text-xs font-semibold text-amber-800">Distillation Agent running — extracting signals & updating weights...</span>
                      </div>
                    )}
                    <button disabled={!distillScore || distillReasons.length < 2 || isDistilling}
                      onClick={() => distillScore && handleDistill(latestCandidate, role, distillScore, distillFeedback, distillReasons)}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                      Submit Performance Review {distillScore ? `(${distillScore}/10)` : ''} {distillReasons.length < 2 ? `— need ${2 - distillReasons.length} more reason${2 - distillReasons.length > 1 ? 's' : ''}` : ''}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 6: Compound Intelligence loop complete */}
              {activeStep === (6 as any) && latestCandidate && (() => {
                const traits = data?.traits?.[`/${latestCandidate}`];
                const score = data?.scores?.[`/${latestCandidate}`];
                const outcome = data?.outcomes?.[`/${latestCandidate}`];
                const interview = data?.interviews?.[`/${latestCandidate}`];
                const currentWeights = data?.meta?.[`/trait_weights/${role}`];
                const weightShifts = previousWeights && currentWeights
                  ? Object.entries(currentWeights).map(([k, v]: [string, any]) => ({
                      trait: k.replace(/_/g, ' '),
                      before: ((previousWeights[k] || 0) * 100).toFixed(1),
                      after: (v * 100).toFixed(1),
                      delta: ((v - (previousWeights[k] || 0)) * 100).toFixed(1),
                    })).filter(w => Math.abs(parseFloat(w.delta)) >= 0.1).sort((a, b) => Math.abs(parseFloat(b.delta)) - Math.abs(parseFloat(a.delta)))
                  : [];
                return (
                <div className="space-y-4 animate-fade-in">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 text-center">
                    <h3 className="text-xl font-bold text-slate-900">Compound Intelligence Updated</h3>
                    <p className="text-sm text-slate-500 mt-1">The Distillation Agent has adjusted the role weights for <strong>{role}</strong>.</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Candidate Journey — {data?.traits?.[`/${latestCandidate}`]?.candidate_name || latestCandidate}</div>
                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold shrink-0">1.</span>
                        <span>Trait Extractor found <strong>{traits?.skills?.length || 0} skills</strong>, {traits?.years_of_experience || 0} YOE, {traits?.education_level || 'N/A'} education</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold shrink-0">2.</span>
                        <span>AI scored <strong>{score?.composite_score?.toFixed(1) || '—'}/100</strong>{score?.reasoning ? ` — "${score.reasoning}"` : ''}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold shrink-0">3.</span>
                        <span>Human review: <strong>{outcome?.outcome || '—'}/10</strong>{outcome?.feedback ? ` — "${outcome.feedback}"` : ''}</span>
                      </div>
                      {interview?.analysis && (
                        <div className="flex items-start gap-2">
                          <span className="text-blue-500 font-bold shrink-0">4.</span>
                          <span>Interview: tech {interview.analysis.technical_depth}/10, communication {interview.analysis.communication_clarity}/10, culture {interview.analysis.cultural_fit}/10, problem-solving {interview.analysis.problem_solving}/10</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {weightShifts.length > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                      <div className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-2">Weight Shifts — What the AI Learned</div>
                      <div className="space-y-1.5">
                        {weightShifts.map(w => (
                          <div key={w.trait} className="flex items-center gap-2 text-sm">
                            <span className="w-36 font-medium text-slate-700 capitalize truncate">{w.trait}</span>
                            <span className="text-slate-400 text-xs w-14 text-right">{w.before}%</span>
                            <span className="text-slate-400 text-xs">→</span>
                            <span className="text-slate-700 text-xs w-14 font-semibold">{w.after}%</span>
                            <span className={`text-xs font-bold ${parseFloat(w.delta) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {parseFloat(w.delta) > 0 ? '+' : ''}{w.delta}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={() => { setActiveStep(1); setLatestCandidate(null); setCandidateId(''); setResumeText(''); setPreviousWeights(null); }} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
                    Process Another Candidate
                  </button>
                </div>
              );})()}

            </div>
          </div>

          {/* Right: Compound Intelligence / Meta Weights */}
          <div className="lg:col-span-5 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded-bl border-b border-l border-blue-200 z-10 uppercase tracking-widest">
              Cubby: hiring-meta
            </div>
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                Active Role Weights
              </h2>
              <p className="text-xs text-slate-500 mt-1">Dynamic scoring algorithm for <strong className="text-slate-700">{role}</strong></p>
            </div>
            <div className="p-5 flex-grow overflow-y-auto">
              <div className="space-y-3">
                {data?.meta && data.meta[`/trait_weights/${role}`] ? (
                  Object.entries(data.meta[`/trait_weights/${role}`])
                    .sort(([, a], [, b]) => (b as number) - (a as number)) // Sort by highest weight
                    .map(([trait, weight]: [string, any]) => (
                    <div key={trait} className="relative group">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700 uppercase tracking-wide">{trait.replace(/_/g, ' ')}</span>
                        <span className="font-bold text-blue-700">{(weight * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div 
                          className="bg-blue-500 h-2.5 rounded-full transition-all duration-1000 ease-out" 
                          style={{ width: `${Math.min(100, weight * 100 * 2)}%` }} // Multiplied by 2 just to make small diffs more visible visually
                        ></div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                    Waiting for first agent execution to initialize weights...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Compound Intelligence Dashboard */}
        <div className="flex-shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              <h2 className="font-bold text-slate-800">Compound Intelligence</h2>
            </div>
            <div className="flex gap-1">
              {([
                { id: 'profile' as const, label: 'Winning DNA' },
                { id: 'impact' as const, label: 'Trait Breakdown' },
                { id: 'signals' as const, label: 'Signals' },
                { id: 'candidates' as const, label: 'Candidates' },
              ]).map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === tab.id ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {/* TAB 1: Winning DNA — Dual Radar Charts + Top Impact + Patterns */}
            {activeTab === 'profile' && (() => {
              const dualRadar = data?.dualRadar || { profile_dna: [], startup_fit: [] };
              const dimStats: any[] = data?.dimensionStats || [];
              const patterns: any[] = data?.compoundPatterns || [];
              const hasProfileData = dualRadar.profile_dna.some((a: any) => a.all_score > 0);
              const hasStartupData = dualRadar.startup_fit.some((a: any) => a.all_score > 0);

              if (!hasProfileData && !hasStartupData && dimStats.length === 0 && patterns.length === 0) {
                return <div className="text-center text-slate-400 py-12 text-sm italic">Process candidates and submit advance/reject decisions to discover winning trait patterns.</div>;
              }

              const allTraitValues: Array<{ label: string; diff: number; winPct: number; rejPct: number; total: number }> = [];
              for (const dim of dimStats) {
                for (const v of dim.values) {
                  if (v.total === 0) continue;
                  allTraitValues.push({ label: traitLabel(dim.key, v.value, dim.type === 'boolean'), diff: v.differential ?? 0, winPct: Math.round((v.winner_rate ?? 0) * 100), rejPct: Math.round((v.reject_rate ?? 0) * 100), total: v.total });
                }
              }
              const topTraits = allTraitValues.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10);

              const candidateIds = data?.traits ? Object.keys(data.traits).map((k: string) => k.replace(/^\//, '')) : [];
              const PROFILE_KEYS = ['education', 'company_caliber', 'career_arc', 'technical_depth', 'proof_of_work', 'public_signal'];
              const STARTUP_KEYS = ['action_speed', 'autonomy', 'judgment', 'communication', 'coachability', 'drive_grit'];
              const PROFILE_LABELS: Record<string, string> = { education: 'Education', company_caliber: 'Company Caliber', career_arc: 'Career Arc', technical_depth: 'Technical Depth', proof_of_work: 'Proof of Work', public_signal: 'Public Signal' };
              const STARTUP_LABELS: Record<string, string> = { action_speed: 'Action & Speed', autonomy: 'Autonomy', judgment: 'Judgment', communication: 'Communication', coachability: 'Coachability', drive_grit: 'Drive & Grit' };

              const getCandidateScores = (cid: string, keys: string[], source: 'profile_dna' | 'startup_fit'): number[] => {
                if (source === 'profile_dna') {
                  const pd = data?.traits?.[`/${cid}`]?.profile_dna;
                  if (!pd) return keys.map(() => 0);
                  return keys.map(k => pd[k] ?? 0);
                }
                const sf = data?.interviews?.[`/${cid}`]?.analysis?.startup_fit;
                if (!sf) return keys.map(() => 0);
                return keys.map(k => sf[k] ?? 0);
              };

              type Layer = { label: string; color: string; fill: string; scores: number[] };

              const buildLayers = (keys: string[], source: 'profile_dna' | 'startup_fit', aggregateAxes: any[]): Layer[] => {
                const layers: Layer[] = [];

                if (radarMode === 'aggregate') {
                  const hasWR = aggregateAxes.some((a: any) => a.winner_score > 0 || a.reject_score > 0);
                  if (hasWR) {
                    layers.push({ label: 'Winners', color: '#22c55e', fill: 'rgba(34,197,94,0.12)', scores: aggregateAxes.map((a: any) => a.winner_score || 0) });
                    layers.push({ label: 'Rejects', color: '#ef4444', fill: 'rgba(239,68,68,0.12)', scores: aggregateAxes.map((a: any) => a.reject_score || 0) });
                  } else {
                    layers.push({ label: 'All', color: '#6366f1', fill: 'rgba(99,102,241,0.12)', scores: aggregateAxes.map((a: any) => a.all_score || 0) });
                  }
                } else if (radarCandidate) {
                  layers.push({ label: radarCandidate, color: '#3b82f6', fill: 'rgba(59,130,246,0.15)', scores: getCandidateScores(radarCandidate, keys, source) });
                  if (radarCompare === 'winners') {
                    layers.push({ label: 'Winners avg', color: '#22c55e', fill: 'rgba(34,197,94,0.08)', scores: aggregateAxes.map((a: any) => a.winner_score || 0) });
                  } else if (radarCompare === 'rejects') {
                    layers.push({ label: 'Rejects avg', color: '#ef4444', fill: 'rgba(239,68,68,0.08)', scores: aggregateAxes.map((a: any) => a.reject_score || 0) });
                  } else if (radarCompare && radarCompare !== radarCandidate) {
                    layers.push({ label: radarCompare, color: '#f59e0b', fill: 'rgba(245,158,11,0.12)', scores: getCandidateScores(radarCompare, keys, source) });
                  }
                }
                return layers;
              };

              const renderRadarChart = (axes: any[], keys: string[], labels: Record<string, string>, title: string, subtitle: string, source: 'profile_dna' | 'startup_fit') => {
                const layers = buildLayers(keys, source, axes);
                if (layers.every(l => l.scores.every(s => s === 0))) return null;
                const cx = 140, cy = 140, maxR = 110, n = keys.length;
                return (
                  <div className="flex-1 min-w-[280px]">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{title}</div>
                    <div className="text-[10px] text-slate-400 mb-3">{subtitle}</div>
                    <div className="flex items-start gap-4">
                      <svg viewBox="0 0 280 280" className="w-[240px] h-[240px] shrink-0">
                        {[0.25, 0.5, 0.75, 1].map(s => (
                          <polygon key={s} points={keys.map((_, i) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return `${cx + maxR * s * Math.cos(a)},${cy + maxR * s * Math.sin(a)}`; }).join(' ')} fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                        ))}
                        {keys.map((_, i) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return <line key={i} x1={cx} y1={cy} x2={cx + maxR * Math.cos(a)} y2={cy + maxR * Math.sin(a)} stroke="#cbd5e1" strokeWidth="0.5" />; })}
                        {keys.map((k, i) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; const lx = cx + (maxR + 16) * Math.cos(a); const ly = cy + (maxR + 16) * Math.sin(a); return <text key={`l${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="text-[8px] fill-slate-500 font-semibold">{labels[k] || k}</text>; })}
                        {layers.map((layer, li) => (
                          <g key={li}>
                            <polygon points={layer.scores.map((s, i) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; const sc = Math.min(1, s / 10); return `${cx + maxR * sc * Math.cos(a)},${cy + maxR * sc * Math.sin(a)}`; }).join(' ')} fill={layer.fill} stroke={layer.color} strokeWidth="1.5" />
                            {layer.scores.map((s, i) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; const sc = Math.min(1, s / 10); return <circle key={i} cx={cx + maxR * sc * Math.cos(a)} cy={cy + maxR * sc * Math.sin(a)} r="2.5" fill={layer.color} />; })}
                          </g>
                        ))}
                      </svg>
                      <div className="space-y-1.5 pt-2">
                        {keys.map((k, i) => (
                          <div key={k} className="text-[11px] flex items-center gap-1.5">
                            <span className="text-slate-500 w-20 truncate">{labels[k] || k}</span>
                            {layers.map((l, li) => (
                              <span key={li} style={{ color: l.color }} className="font-bold w-6 text-right">{l.scores[i]}</span>
                            ))}
                          </div>
                        ))}
                        <div className="flex items-center gap-3 mt-2 text-[10px] flex-wrap">
                          {layers.map((l, li) => (
                            <span key={li} className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }}></span>
                              <span className="text-slate-600 font-medium">{l.label}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <div className="space-y-6">
                  {/* Radar Controls */}
                  <div className="flex flex-wrap items-center gap-3 bg-slate-50 rounded-lg p-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setRadarMode('aggregate'); setRadarCandidate(null); }}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded ${radarMode === 'aggregate' ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>
                        Winners vs Rejects
                      </button>
                      <button onClick={() => { setRadarMode('candidate'); if (!radarCandidate && candidateIds.length > 0) setRadarCandidate(candidateIds[0]); }}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded ${radarMode === 'candidate' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>
                        Compare Candidate
                      </button>
                    </div>
                    {radarMode === 'candidate' && (
                      <>
                        <select value={radarCandidate || ''} onChange={e => setRadarCandidate(e.target.value)}
                          className="text-xs border border-slate-300 rounded px-2 py-1 bg-white outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="" disabled>Select candidate</option>
                          {candidateIds.map(cid => <option key={cid} value={cid}>{cid}</option>)}
                        </select>
                        <span className="text-[10px] text-slate-400">vs</span>
                        <select value={radarCompare} onChange={e => setRadarCompare(e.target.value)}
                          className="text-xs border border-slate-300 rounded px-2 py-1 bg-white outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="winners">Winning Persona (avg)</option>
                          <option value="rejects">Reject Persona (avg)</option>
                          {candidateIds.filter(c => c !== radarCandidate).map(cid => <option key={cid} value={cid}>{cid}</option>)}
                        </select>
                      </>
                    )}
                  </div>

                  {/* Dual Radar Charts */}
                  <div className="flex flex-wrap gap-6">
                    {renderRadarChart(dualRadar.profile_dna, PROFILE_KEYS, PROFILE_LABELS, 'Profile DNA', 'Education, companies, career, technical depth, shipped work, public presence', 'profile_dna')}
                    {renderRadarChart(dualRadar.startup_fit, STARTUP_KEYS, STARTUP_LABELS, 'Startup Fit', 'Action bias, autonomy, judgment, communication, coachability, drive', 'startup_fit')}
                  </div>

                  {/* Top Differentiating Traits */}
                  {topTraits.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Top Differentiating Traits</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {topTraits.map((t, i) => (
                          <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border-l-4 ${t.diff > 0 ? 'border-l-green-500 bg-green-50' : 'border-l-red-400 bg-red-50'}`}>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-800 capitalize truncate">{t.label}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                <span className="text-green-600 font-bold">{t.winPct}% winners</span>
                                <span className="mx-1.5 text-slate-300">|</span>
                                <span className="text-red-500 font-bold">{t.rejPct}% rejects</span>
                                <span className="mx-1.5 text-slate-300">|</span>
                                <span>{t.total} candidates</span>
                              </div>
                            </div>
                            <div className={`text-lg font-black shrink-0 ${t.diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {t.diff > 0 ? '+' : ''}{Math.round(t.diff * 100)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Compound Patterns */}
                  {patterns.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-violet-500 uppercase tracking-widest mb-3">Compound Patterns — Winning Combinations</div>
                      <div className="space-y-2">
                        {patterns.sort((a: any, b: any) => b.avg_outcome - a.avg_outcome).map((p: any, i: number) => (
                          <div key={p.id || i} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                            <div className="flex flex-wrap gap-1.5 flex-1">
                              {Object.entries(p.traits || {}).map(([k, v]: [string, any]) => (
                                <span key={k} className="px-2 py-0.5 bg-violet-100 text-violet-800 text-[11px] rounded-full font-medium">
                                  {v === true ? k.replace(/_/g, ' ') : `${k.replace(/_/g, ' ')} = ${String(v).replace(/_/g, ' ')}`}
                                </span>
                              ))}
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`text-sm font-black ${p.avg_outcome >= 7 ? 'text-green-600' : p.avg_outcome >= 5 ? 'text-yellow-600' : 'text-red-500'}`}>{p.avg_outcome}/10</div>
                              <div className="text-[10px] text-slate-400">{p.winner_count}/{p.total_count} winners</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* TAB 2: Trait Breakdown — comparison table */}
            {activeTab === 'impact' && (() => {
              const dimStats: any[] = data?.dimensionStats || [];
              if (dimStats.length === 0) {
                return <div className="text-center text-slate-400 py-12 text-sm italic">No trait dimensions computed yet. Process candidates to populate.</div>;
              }
              const groups = ['education', 'experience', 'career', 'technical', 'projects'];
              const groupLabels: Record<string, string> = { education: 'Education', experience: 'Experience', career: 'Career Path', technical: 'Technical', projects: 'Projects & Impact' };
              return (
                <div className="space-y-5">
                  {groups.map(group => {
                    const dims = dimStats.filter((d: any) => d.group === group);
                    if (dims.length === 0) return null;
                    return (
                      <div key={group}>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{groupLabels[group] || group}</div>
                        <div className="bg-slate-50 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left py-2 px-3 font-semibold text-slate-500 w-[30%]">Trait</th>
                                <th className="text-center py-2 px-2 font-semibold text-green-600 w-[20%]">Winners</th>
                                <th className="text-center py-2 px-2 font-semibold text-red-500 w-[20%]">Rejects</th>
                                <th className="text-center py-2 px-2 font-semibold text-slate-500 w-[15%]">Avg Score</th>
                                <th className="text-center py-2 px-2 font-semibold text-slate-500 w-[15%]">Impact</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dims.map((dim: any) => dim.values.map((v: any) => {
                                if (v.total === 0) return null;
                                const diff = v.differential ?? 0;
                                const label = traitLabel(dim.key, v.value, dim.type === 'boolean');
                                return (
                                  <tr key={`${dim.key}-${v.value}`} className="border-b border-slate-100 hover:bg-white">
                                    <td className="py-2 px-3 font-medium text-slate-700">{label}</td>
                                    <td className="py-2 px-2 text-center">
                                      <div className="flex items-center gap-1.5 justify-center">
                                        <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                                          <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(100, (v.winner_rate ?? 0) * 100)}%` }}></div>
                                        </div>
                                        <span className="text-green-700 font-bold w-8">{Math.round((v.winner_rate ?? 0) * 100)}%</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <div className="flex items-center gap-1.5 justify-center">
                                        <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                                          <div className="bg-red-400 h-2 rounded-full" style={{ width: `${Math.min(100, (v.reject_rate ?? 0) * 100)}%` }}></div>
                                        </div>
                                        <span className="text-red-600 font-bold w-8">{Math.round((v.reject_rate ?? 0) * 100)}%</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <span className={`font-bold ${v.avg_outcome >= 7 ? 'text-green-600' : v.avg_outcome >= 5 ? 'text-yellow-600' : 'text-red-500'}`}>{v.avg_outcome}</span>
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <span className={`font-black text-sm ${diff > 0.05 ? 'text-green-600' : diff < -0.05 ? 'text-red-500' : 'text-slate-400'}`}>
                                        {diff > 0 ? '+' : ''}{Math.round(diff * 100)}%
                                      </span>
                                    </td>
                                  </tr>
                                );
                              }))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* TAB 3: Qualitative Signals */}
            {activeTab === 'signals' && (() => {
              const sigs = data?.signals ? Object.entries(data.signals).map(([key, sig]: [string, any]) => ({ key, ...sig, corr: data.signalCorrelations?.[key] })).sort((a, b) => (b.strength * b.occurrence_count) - (a.strength * a.occurrence_count)) : [];
              if (sigs.length === 0) {
                return <div className="text-center text-slate-400 py-12 text-sm italic">No qualitative signals discovered yet. Submit reviews with trait-level reasons.</div>;
              }
              return (
                <div className="space-y-2">
                  {sigs.map((sig) => (
                    <div key={sig.key} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${sig.direction === 'positive' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{sig.signal}</div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                          <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded font-medium">{sig.category?.replace(/_/g, ' ')}</span>
                          <span>seen {sig.occurrence_count}x</span>
                          <span>strength: {(sig.strength * 100).toFixed(0)}%</span>
                          {sig.corr?.avg_human_score > 0 && <span className={`font-bold ${sig.corr.avg_human_score >= 7 ? 'text-green-600' : sig.corr.avg_human_score >= 5 ? 'text-yellow-600' : 'text-red-500'}`}>avg {sig.corr.avg_human_score}/10</span>}
                          <span>{sig.candidate_ids?.length || 0} candidate{(sig.candidate_ids?.length || 0) !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* TAB 4: Candidates */}
            {activeTab === 'candidates' && (() => {
              if (!data?.traits || Object.keys(data.traits).length === 0) {
                return <div className="text-center text-slate-400 py-12 text-sm italic">No candidates processed yet.</div>;
              }

              // Collect unique roles from statuses and traits for the filter dropdown
              const allRoles = new Set<string>();
              for (const key of Object.keys(data.traits)) {
                const st = data.statuses?.[key];
                const t = data.traits?.[key];
                const r = st?.role || t?.role;
                if (r) allRoles.add(r);
              }

              // Filter candidates by search + role
              const filteredKeys = Object.keys(data.traits).filter((key: string) => {
                const t = data.traits?.[key];
                const st = data.statuses?.[key];
                const cid = key.replace(/^\//, '');
                const name = (t?.candidate_name || cid).toLowerCase();
                const r = st?.role || t?.role || '';

                if (candidateSearch && !name.includes(candidateSearch.toLowerCase()) && !cid.toLowerCase().includes(candidateSearch.toLowerCase())) {
                  return false;
                }
                if (candidateRoleFilter !== 'all' && r !== candidateRoleFilter) {
                  return false;
                }
                return true;
              });

              return (
                <div>
                  {/* Sourcing stats summary */}
                  {data?.meta?.['/sourcing_stats'] && Object.keys(data.meta['/sourcing_stats']).length > 0 && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Sourcing Intelligence</div>
                      <div className="flex flex-wrap gap-4 text-xs">
                        {Object.entries(data.meta['/sourcing_stats']).map(([src, stats]: [string, any]) => (
                          <div key={src} className="flex items-center gap-2">
                            <span className="font-semibold text-slate-700 capitalize">{src}</span>
                            <span className="text-slate-400">{stats.total_candidates} candidates</span>
                            <span className={`font-bold ${stats.avg_human_score >= 7 ? 'text-green-600' : stats.avg_human_score >= 5 ? 'text-yellow-600' : 'text-red-500'}`}>{stats.avg_human_score}/10 avg</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Search + Role Filter */}
                  <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input
                        type="text"
                        placeholder="Search candidates by name..."
                        value={candidateSearch}
                        onChange={(e) => setCandidateSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {candidateSearch && (
                        <button onClick={() => setCandidateSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    {allRoles.size > 1 && (
                      <select
                        value={candidateRoleFilter}
                        onChange={(e) => setCandidateRoleFilter(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="all">All Roles ({Object.keys(data.traits).length})</option>
                        {Array.from(allRoles).sort().map(r => {
                          const count = Object.keys(data.traits).filter((k: string) => {
                            const st = data.statuses?.[k];
                            const t = data.traits?.[k];
                            return (st?.role || t?.role) === r;
                          }).length;
                          return <option key={r} value={r}>{r} ({count})</option>;
                        })}
                      </select>
                    )}
                  </div>

                  {filteredKeys.length === 0 ? (
                    <div className="text-center text-slate-400 py-8 text-sm italic">No candidates match your search.</div>
                  ) : (
                    <div className="text-[10px] text-slate-400 mb-2">{filteredKeys.length} candidate{filteredKeys.length !== 1 ? 's' : ''}</div>
                  )}

                  <div className="flex flex-wrap gap-2 mb-3">
                    {filteredKeys.map((key: string) => {
                      const cid = key.replace(/^\//, '');
                      const t = data.traits?.[key];
                      const s = data.scores?.[key];
                      const st = data.statuses?.[key];
                      const isSelected = selectedCandidate === cid;
                      const displayName = t?.candidate_name || cid;
                      const displayRole = st?.role || t?.role;
                      return (
                        <button key={cid} onClick={() => setSelectedCandidate(isSelected ? null : cid)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                          <div className="text-left">
                            <span className="font-semibold block">{displayName}</span>
                            {displayRole && <span className={`text-[10px] block ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>{displayRole}</span>}
                          </div>
                          {s && <span className={`text-xs px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-500' : s.composite_score >= 70 ? 'bg-green-100 text-green-700' : s.composite_score >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{s.composite_score?.toFixed(0)}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {selectedCandidate && (() => {
                    const t = data.traits?.[`/${selectedCandidate}`];
                    const s = data.scores?.[`/${selectedCandidate}`];
                    const o = data.outcomes?.[`/${selectedCandidate}`];
                    const iv = data.interviews?.[`/${selectedCandidate}`];
                    if (!t) return null;

                    return (
                      <div className="border border-slate-200 rounded-lg p-4 animate-fade-in">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="font-bold text-slate-900 text-lg">{t.candidate_name || selectedCandidate}</h3>
                            <p className="text-xs text-slate-500">
                              {data.statuses?.[`/${selectedCandidate}`]?.role || t.role ? <span className="font-medium text-blue-600">{data.statuses?.[`/${selectedCandidate}`]?.role || t.role} · </span> : null}
                              {t.education_level} | {t.years_of_experience} YOE | {t.skills?.length || 0} skills
                              {t.source && <span className="ml-1 text-slate-400">· via {t.source}</span>}
                            </p>
                            {t.linkedin_url && <a href={t.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-500 hover:underline">LinkedIn ↗</a>}
                          </div>
                          <div className="flex gap-3 items-center">
                            {s && <div className="text-center"><div className="text-[10px] text-slate-400 uppercase">AI</div><div className={`text-lg font-black ${s.composite_score >= 70 ? 'text-green-600' : s.composite_score >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{s.composite_score?.toFixed(0)}</div></div>}
                            {o && <div className="text-center"><div className="text-[10px] text-slate-400 uppercase">Human</div><div className={`text-lg font-black ${o.outcome >= 7 ? 'text-green-600' : o.outcome >= 5 ? 'text-yellow-600' : 'text-red-500'}`}>{o.outcome}/10</div></div>}
                          </div>
                        </div>

                        {/* Structured dimensions as pill badges */}
                        {t.dimensions && Object.keys(t.dimensions).length > 0 && (
                          <div className="mb-4">
                            <div className="text-[10px] text-violet-500 uppercase tracking-wider mb-1.5 font-semibold">Trait Dimensions</div>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(t.dimensions).filter(([, v]) => v !== false && v !== 'unknown').map(([k, v]: [string, any]) => (
                                <span key={k} className="px-2 py-0.5 bg-violet-100 text-violet-800 text-[11px] rounded-full font-medium capitalize">
                                  {v === true ? k.replace(/_/g, ' ') : `${k.replace(/_/g, ' ')}: ${String(v).replace(/_/g, ' ')}`}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {t.skills && t.skills.length > 0 && (
                          <div className="mb-4">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">Skills</div>
                            <div className="flex flex-wrap gap-1">{t.skills.slice(0, 12).map((sk: string) => <span key={sk} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] rounded-full">{sk}</span>)}{t.skills.length > 12 && <span className="px-2 py-0.5 text-slate-400 text-[11px]">+{t.skills.length - 12} more</span>}</div>
                          </div>
                        )}

                        {iv?.analysis && (
                          <div className="mb-4 grid grid-cols-4 gap-2">
                            {['technical_depth','communication_clarity','cultural_fit','problem_solving'].map(k => (
                              <div key={k} className="bg-teal-50 p-2 rounded border border-teal-100 text-center">
                                <div className="text-[10px] text-slate-500 uppercase leading-tight">{k.replace(/_/g,' ')}</div>
                                <div className="font-bold text-teal-700">{iv.analysis[k]}/10</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {o?.reasons && o.reasons.length > 0 && (
                          <div className="mb-3 bg-violet-50 border border-violet-100 rounded-lg p-3">
                            <div className="text-[10px] text-violet-500 uppercase tracking-wider font-semibold mb-1">Trait-Level Reasons</div>
                            <div className="flex flex-wrap gap-1.5">
                              {o.reasons.map((r: string, i: number) => (
                                <span key={i} className="px-2 py-0.5 bg-violet-100 text-violet-800 text-[11px] rounded-full font-medium">{r}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {o?.feedback && (
                          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                            <div className="text-[10px] text-indigo-500 uppercase tracking-wider font-semibold mb-1">Human Feedback</div>
                            <p className="text-sm text-slate-700 italic">"{o.feedback}"</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Bottom Half: Full Width Live Network/Cubby Terminal */}
        <div className="flex-grow flex flex-col bg-slate-900 rounded-xl shadow-inner border border-slate-800 overflow-hidden font-mono text-xs">
          <div className="bg-slate-950 border-b border-slate-800 px-4 py-2 flex justify-between items-center text-slate-400 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
              </div>
              <span className="uppercase tracking-widest text-[10px] font-bold ml-2">Live DDC Network & Cubby Stream</span>
            </div>
            <button onClick={() => setTerminalLogs([])} className="hover:text-white transition-colors">clear</button>
          </div>
          
          <div className="p-4 overflow-y-auto flex-grow space-y-1.5 custom-scrollbar">
            {terminalLogs.length === 0 ? (
              <div className="text-slate-600 italic">Listening for network events...</div>
            ) : (
              terminalLogs.map((log, i) => {
                let colorClass = 'text-slate-300';
                let prefix = '';
                
                if (log.type === 'system') {
                  colorClass = 'text-blue-400';
                  prefix = '[UI] ';
                } else if (log.type === 'network') {
                  colorClass = 'text-yellow-300';
                  prefix = '[NET] ';
                } else if (log.type === 'agent') {
                  colorClass = 'text-green-400';
                  prefix = '[AGENT] ';
                } else if (log.type === 'cubby') {
                  colorClass = 'text-purple-400 font-bold';
                  prefix = '[CUBBY] ';
                }

                // Make JSON payloads slightly dimmer for readability
                const messageParts = log.message.split(' = {');
                const isJson = messageParts.length > 1;

                return (
                  <div key={i} className={`flex ${colorClass} hover:bg-slate-800/50 px-1 rounded`}>
                    <span className="text-slate-600 w-24 shrink-0">{log.time}</span>
                    <span className="w-20 shrink-0 opacity-80">{prefix}</span>
                    <span className="break-all">
                      {isJson ? (
                        <>
                          {messageParts[0]} = <span className="text-slate-500 font-normal">{'{' + messageParts[1]}</span>
                        </>
                      ) : (
                        log.message
                      )}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0f172a; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569; 
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
