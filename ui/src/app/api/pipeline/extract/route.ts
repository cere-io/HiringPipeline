import { NextResponse } from 'next/server';

export const runtime = 'edge';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const SYSTEM_PROMPT = `You are a senior technical recruiter extracting structured signals from a resume.
Return ONLY this JSON object. No markdown. No explanation.
{
  "skills": ["list of technical/soft skills"],
  "years_of_experience": <integer>,
  "company_stages": ["startup" | "series_a" | "series_b" | "growth" | "public" | "enterprise"],
  "education_level": "Bachelors" | "Masters" | "PhD" | "None",
  "schools": { "items": ["school names"], "rating": <0-10> },
  "hard_things_done": { "items": ["impressive achievements"], "rating": <0-10> },
  "hackathons": { "items": ["hackathon names"], "rating": <0-10> },
  "open_source_contributions": { "items": ["OSS projects"], "rating": <0-10> },
  "company_signals": { "items": ["notable employers"], "rating": <0-10> },
  "dimensions": {
    "school_tier": "tier_1" | "tier_2" | "tier_3" | "unknown",
    "school_geography": "us" | "europe" | "asia" | "other" | "unknown",
    "field_of_study": "cs" | "engineering" | "science" | "business" | "other",
    "has_bigtech": true | false,
    "company_tier": "faang" | "tier_1_tech" | "funded_startup" | "enterprise" | "other",
    "primary_tech_domain": "systems" | "web" | "data_ml" | "mobile" | "infra" | "fullstack",
    "career_trajectory": "startup_first" | "bigtech_first" | "mixed" | "enterprise_only",
    "top_languages": ["up to 5 primary programming languages"]
  },
  "profile_dna": {
    "education": <0-10>, "company_caliber": <0-10>, "career_arc": <0-10>,
    "technical_depth": <0-10>, "proof_of_work": <0-10>, "public_signal": <0-10>
  }
}
Rating scale: 0 = none/unknown, 5 = average, 10 = exceptional.`;

function extractJsonFromText(raw: string): any {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found in LLM output');
    return JSON.parse(cleaned.slice(start, end + 1));
}

function ratingObj(v: any) {
    if (v && typeof v === 'object' && 'rating' in v)
        return { items: Array.isArray(v.items) ? v.items : [], rating: Number(v.rating) || 0 };
    return { items: [], rating: typeof v === 'number' ? v : 0 };
}

function computeDimensions(traits: any) {
    const yoe = traits.years_of_experience || 0;
    const stages = traits.company_stages || [];
    return {
        education_level: traits.education_level || 'Unknown',
        yoe_bucket: yoe <= 2 ? '0-2' : yoe <= 5 ? '3-5' : yoe <= 10 ? '6-10' : '10+',
        has_startup: stages.includes('startup'),
        has_growth_stage: stages.includes('growth') || stages.includes('series_b'),
        has_open_source: (traits.open_source_contributions?.items?.length || 0) > 0,
        has_hackathons: (traits.hackathons?.items?.length || 0) > 0,
        has_hard_things: (traits.hard_things_done?.rating || 0) >= 6,
        hard_things_bucket: (traits.hard_things_done?.rating || 0) >= 7 ? 'high' : (traits.hard_things_done?.rating || 0) >= 4 ? 'mid' : 'low',
        schools_bucket: (traits.schools?.rating || 0) >= 7 ? 'high' : (traits.schools?.rating || 0) >= 4 ? 'mid' : 'low',
    };
}

export async function POST(req: Request) {
    try {
        const { candidateId, role, resumeText } = await req.json();
        if (!candidateId || !role || !resumeText) {
            return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ success: false, error: 'GEMINI_API_KEY not set' }, { status: 500 });
        }

        const res = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'gemini-2.0-flash',
                messages: [
                    { role: 'system', content: `${SYSTEM_PROMPT}\nRole: ${role}` },
                    { role: 'user', content: `Resume:\n${resumeText.slice(0, 4000)}` }
                ],
                temperature: 0.2
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ success: false, error: `Gemini ${res.status}: ${errText}` }, { status: 502 });
        }

        const data = await res.json();
        const rawContent = data.choices[0].message.content;
        const parsed = extractJsonFromText(rawContent);

        const traits = {
            candidate_id: candidateId,
            skills: Array.isArray(parsed.skills) ? parsed.skills : [],
            years_of_experience: Number(parsed.years_of_experience) || 0,
            company_stages: Array.isArray(parsed.company_stages) ? parsed.company_stages : [],
            education_level: parsed.education_level || 'Unknown',
            schools: ratingObj(parsed.schools),
            hard_things_done: ratingObj(parsed.hard_things_done),
            hackathons: ratingObj(parsed.hackathons),
            open_source_contributions: ratingObj(parsed.open_source_contributions),
            company_signals: ratingObj(parsed.company_signals),
            conclusive_score: 0,
            source_completeness: { has_resume: true, has_linkedin: false },
            extracted_at: new Date().toISOString(),
            dimensions: { ...computeDimensions(parsed), ...(parsed.dimensions || {}) },
            profile_dna: parsed.profile_dna,
        };

        return NextResponse.json({
            success: true,
            traits,
            logs: [`Extracted traits: skills=${traits.skills.length}, yoe=${traits.years_of_experience}`],
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
