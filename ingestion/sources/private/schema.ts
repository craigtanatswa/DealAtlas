import { z } from "zod";

const stringish = z.union([z.string(), z.number()]).transform((value) => String(value));

export const privateRecordSchema = z
  .object({
    id: stringish.optional(),
    project_id: stringish.optional(),
    projectId: stringish.optional(),
    title: z.string().optional(),
    project_name: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

export const canonicalPrivateCandidateSchema = z.object({
  sourceKey: z.string().min(1),
  ocid: z.string().min(1),
  externalPrimaryId: z.string().min(1),
  noticeIdentifier: z.string().min(1),
  releaseId: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceUrl: z.string().min(1),
  dealType: z.string().min(1),
  buyerSector: z.string().min(1),
  stage: z.string().min(1),
  status: z.string().min(1),
  currency: z.string().min(1),
  organizations: z.array(z.unknown()),
  lots: z.array(z.unknown()),
  requirements: z.array(z.unknown()),
  awardCriteria: z.array(z.unknown()),
  awards: z.array(z.unknown()),
  contracts: z.array(z.unknown()),
  documents: z.array(z.unknown()),
  classifications: z.array(z.unknown()),
  relatedOcids: z.array(z.string()),
});
