import type { ApplyChannel } from "@/lib/generated/prisma/enums";

/** One job in the shape every source converts to. */
export type NormalisedJob = {
  source: string;
  sourceJobId: string;
  publisher: string | null;
  title: string;
  company: string;
  location: string | null;
  workMode: string | null;
  employmentType: string | null;
  description: string;
  url: string;
  applyUrl: string | null;
  applyEmail: string | null;
  applyChannel: ApplyChannel;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  postedAt: Date | null;
  rawJson: unknown;
};

export type FetchContext = {
  now: Date;
  keywords: string[];
  locations: string[];
  /** Places where the search should add a phrase, such as "visa sponsorship". A bare name uses that phrase. */
  visaLocations?: (string | { country: string; term: string })[];
  /** Requests this source has made so far, so it can stay inside its quota. */
  usage: { requestsThisMonth: number; requestsToday: number };
  /** A single search to run instead of the usual rotation. */
  manualQuery?: { query: string; country?: string };
};

export type FetchResult = {
  jobs: NormalisedJob[];
  requests: number;
  queries: string[];
  /** Records the source returned that couldn't be used. */
  skipped: number;
  errors: string[];
};

export interface JobSource {
  name: string;
  isConfigured(): boolean;
  fetch(context: FetchContext): Promise<FetchResult>;
}
