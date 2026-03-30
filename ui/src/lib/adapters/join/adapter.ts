import type { ATSAdapter, RawSubject, SubjectMeta } from '../interface';
import { JoinAPIClient } from './client';
import { extractResumeFromJoinApp } from './pdf-extractor';
import type { JoinApplication } from '../../agents/types';

export class JoinAdapter implements ATSAdapter {
  name = 'Join.com';
  type = 'join';
  private client: JoinAPIClient;

  constructor(token: string) {
    this.client = new JoinAPIClient(token);
  }

  async pollNewSubjects(since?: string): Promise<RawSubject[]> {
    const apps = await this.client.getRecentApplications(2);
    const filtered = since
      ? apps.filter(a => new Date(a.createdAt) > new Date(since))
      : apps;

    const subjects: RawSubject[] = [];
    for (const app of filtered) {
      const text = await extractResumeFromJoinApp(app, this.client);
      subjects.push(this.appToRawSubject(app, text));
    }
    return subjects;
  }

  normalizeWebhook(body: any): RawSubject {
    if (body.candidate && body.job) {
      return this.appToRawSubject(body as JoinApplication, body.resumeText || 'Applied via Join.com');
    }

    return {
      externalId: body.candidateId || `join-${Date.now()}`,
      name: body.candidateName || 'Unknown',
      email: body.candidateEmail,
      role: body.role || body.job?.title || 'engineer',
      source: 'join',
      text: body.resumeText || 'Applied via Join.com without parsable resume.',
      metadata: body,
      createdAt: new Date().toISOString(),
    };
  }

  toSubjectMeta(subject: RawSubject): SubjectMeta {
    return {
      subjectId: subject.externalId.startsWith('join-') ? subject.externalId : `join-${subject.externalId}`,
      name: subject.name,
      email: subject.email,
      role: subject.role,
      source: 'join',
      externalId: subject.externalId,
      linkedinUrl: subject.metadata?.candidate?.professionalLinks?.find((l: any) => l.type === 'LINKEDIN')?.url,
      metadata: subject.metadata,
    };
  }

  private appToRawSubject(app: JoinApplication, text: string): RawSubject {
    return {
      externalId: `join-${app.candidate.id}`,
      name: `${app.candidate.firstName} ${app.candidate.lastName}`,
      email: app.candidate.email,
      role: app.job.title,
      source: 'join',
      text,
      metadata: {
        joinApplicationId: app.id,
        joinCandidateId: app.candidate.id,
        joinSource: app.source.product,
        candidate: app.candidate,
        job: app.job,
      },
      createdAt: app.createdAt,
    };
  }
}
