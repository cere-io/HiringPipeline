import { extractText } from 'unpdf';
import type { JoinApplication } from '../../agents/types';
import { JoinAPIClient } from './client';

export async function extractResumeFromJoinApp(app: JoinApplication, client: JoinAPIClient): Promise<string> {
  const cvAttachment = app.attachments.find(a => a.type === 'CV');
  if (!cvAttachment) return buildFallbackProfile(app);

  try {
    const pdfBuffer = await client.downloadAttachment(cvAttachment.url);
    const { text } = await extractText(pdfBuffer);
    const fullText = Array.isArray(text) ? text.join('\n\n') : text;
    if (fullText && fullText.trim().length > 50) return fullText;
    return buildFallbackProfile(app);
  } catch {
    return buildFallbackProfile(app);
  }
}

function buildFallbackProfile(app: JoinApplication): string {
  const parts = [`Candidate: ${app.candidate.firstName} ${app.candidate.lastName}`];
  parts.push(`Applied for: ${app.job.title}`);
  if (app.candidate.country) parts.push(`Location: ${app.candidate.country.name}`);
  const linkedin = app.candidate.professionalLinks?.find(l => l.type === 'LINKEDIN');
  if (linkedin) parts.push(`LinkedIn: ${linkedin.url}`);
  if (app.screeningQuestions?.length > 0) {
    parts.push('Screening answers:');
    for (const q of app.screeningQuestions) {
      if (q.answer && !q.isSkipped) parts.push(`  ${q.question}: ${q.answer}`);
    }
  }
  return parts.join('\n');
}
