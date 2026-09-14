import { z } from "zod";

const stringish = z.union([z.string(), z.number()]).transform((value) => String(value));

const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => value ?? undefined);

const nullableBoolean = z
  .union([z.boolean(), z.null()])
  .optional()
  .transform((value) => value ?? undefined);

const nullableNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null || value === "") {
      return undefined;
    }
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  });

export const ocdsIdentifierSchema = z
  .object({
    scheme: nullableString,
    id: stringish.optional(),
    legalName: nullableString,
    uri: nullableString,
  })
  .passthrough();

export const ocdsClassificationSchema = z
  .object({
    scheme: nullableString,
    id: stringish.optional(),
    description: nullableString,
  })
  .passthrough();

export const ocdsValueSchema = z
  .object({
    amount: nullableNumber,
    amountGross: nullableNumber,
    minAmount: nullableNumber,
    currency: nullableString,
  })
  .passthrough();

export const ocdsPeriodSchema = z
  .object({
    startDate: nullableString,
    endDate: nullableString,
    maxExtentDate: nullableString,
    durationInDays: nullableNumber,
  })
  .passthrough();

export const ocdsAddressSchema = z
  .object({
    streetAddress: nullableString,
    locality: nullableString,
    region: nullableString,
    postalCode: nullableString,
    countryName: nullableString,
    country: nullableString,
  })
  .passthrough();

export const ocdsContactSchema = z
  .object({
    name: nullableString,
    email: nullableString,
    telephone: nullableString,
    url: nullableString,
  })
  .passthrough();

export const ocdsDocumentSchema = z
  .object({
    id: stringish.optional(),
    documentType: nullableString,
    noticeType: nullableString,
    description: nullableString,
    title: nullableString,
    url: nullableString,
    datePublished: nullableString,
    format: nullableString,
    relatedLot: nullableString,
    relatedLots: z.array(z.string()).optional(),
  })
  .passthrough();

export const ocdsItemSchema = z
  .object({
    id: stringish.optional(),
    description: nullableString,
    relatedLot: nullableString,
    additionalClassifications: z.array(ocdsClassificationSchema).optional(),
    deliveryAddresses: z.array(ocdsAddressSchema).optional(),
  })
  .passthrough();

export const ocdsCriterionSchema = z
  .object({
    type: nullableString,
    name: nullableString,
    description: nullableString,
    appliesTo: nullableString,
    numbers: z
      .array(
        z
          .object({
            number: nullableNumber,
            weight: nullableNumber,
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const ocdsLotSchema = z
  .object({
    id: stringish,
    title: nullableString,
    description: nullableString,
    status: nullableString,
    value: ocdsValueSchema.optional(),
    contractPeriod: ocdsPeriodSchema.optional(),
    awardCriteria: z
      .object({
        criteria: z.array(ocdsCriterionSchema).optional(),
      })
      .passthrough()
      .optional(),
    hasRenewal: nullableBoolean,
    renewal: z
      .object({
        description: nullableString,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const ocdsPartySchema = z
  .object({
    id: stringish,
    name: nullableString,
    identifier: ocdsIdentifierSchema.optional(),
    additionalIdentifiers: z.array(ocdsIdentifierSchema).optional(),
    address: ocdsAddressSchema.optional(),
    contactPoint: ocdsContactSchema.optional(),
    roles: z.array(z.string()).optional(),
    details: z
      .object({
        url: nullableString,
        buyerProfile: nullableString,
        classifications: z.array(ocdsClassificationSchema).optional(),
        scale: nullableString,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const ocdsAwardSchema = z
  .object({
    id: stringish,
    title: nullableString,
    status: nullableString,
    date: nullableString,
    value: ocdsValueSchema.optional(),
    relatedLots: z.array(z.string()).optional(),
    suppliers: z
      .array(
        z
          .object({
            id: stringish.optional(),
            name: nullableString,
          })
          .passthrough(),
      )
      .optional(),
    items: z.array(ocdsItemSchema).optional(),
    documents: z.array(ocdsDocumentSchema).optional(),
    contractPeriod: ocdsPeriodSchema.optional(),
    standstillPeriod: ocdsPeriodSchema.optional(),
    hasRenewal: nullableBoolean,
    renewal: z
      .object({
        description: nullableString,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const ocdsContractSchema = z
  .object({
    id: stringish,
    awardID: stringish.optional(),
    title: nullableString,
    status: nullableString,
    dateSigned: nullableString,
    value: ocdsValueSchema.optional(),
    period: ocdsPeriodSchema.optional(),
  })
  .passthrough();

export const ocdsRelatedProcessSchema = z
  .object({
    id: stringish.optional(),
    relationship: z.array(z.string()).optional(),
    scheme: nullableString,
    identifier: nullableString,
    uri: nullableString,
  })
  .passthrough();

export const ocdsTenderSchema = z
  .object({
    id: stringish.optional(),
    title: nullableString,
    description: nullableString,
    status: nullableString,
    procurementMethod: nullableString,
    procurementMethodDetails: nullableString,
    mainProcurementCategory: nullableString,
    value: ocdsValueSchema.optional(),
    minValue: ocdsValueSchema.optional(),
    tenderPeriod: ocdsPeriodSchema.optional(),
    enquiryPeriod: ocdsPeriodSchema.optional(),
    awardPeriod: ocdsPeriodSchema.optional(),
    contractPeriod: ocdsPeriodSchema.optional(),
    classification: ocdsClassificationSchema.optional(),
    items: z.array(ocdsItemSchema).optional(),
    lots: z.array(ocdsLotSchema).optional(),
    documents: z.array(ocdsDocumentSchema).optional(),
    selectionCriteria: z
      .object({
        criteria: z.array(ocdsCriterionSchema).optional(),
      })
      .passthrough()
      .optional(),
    awardCriteria: z
      .object({
        criteria: z.array(ocdsCriterionSchema).optional(),
      })
      .passthrough()
      .optional(),
    communication: z
      .object({
        futureNoticeDate: nullableString,
        atypicalToolUrl: nullableString,
      })
      .passthrough()
      .optional(),
    submissionMethodDetails: nullableString,
    techniques: z
      .object({
        hasFrameworkAgreement: nullableBoolean,
        hasDynamicPurchasingSystem: nullableBoolean,
        hasElectronicAuction: nullableBoolean,
      })
      .passthrough()
      .optional(),
    suitability: z
      .object({
        sme: nullableBoolean,
        vcse: nullableBoolean,
      })
      .passthrough()
      .optional(),
    otherRequirements: z
      .object({
        reservedParticipation: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    hasRenewal: nullableBoolean,
    renewal: z
      .object({
        description: nullableString,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const ocdsReleaseSchema = z
  .object({
    ocid: z.string().min(1),
    id: stringish,
    date: nullableString,
    tag: z.union([z.string(), z.array(z.string())]).optional(),
    initiationType: nullableString,
    language: nullableString,
    tender: ocdsTenderSchema.optional(),
    parties: z.array(ocdsPartySchema).optional(),
    buyer: z
      .object({
        id: stringish.optional(),
        name: nullableString,
      })
      .passthrough()
      .optional(),
    awards: z.array(ocdsAwardSchema).optional(),
    contracts: z.array(ocdsContractSchema).optional(),
    relatedProcesses: z.array(ocdsRelatedProcessSchema).optional(),
    bids: z
      .object({
        statistics: z
          .array(
            z
              .object({
                id: stringish.optional(),
                measure: nullableString,
                value: nullableNumber,
                relatedLot: nullableString,
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const ocdsReleasePackageSchema = z
  .object({
    uri: nullableString,
    version: nullableString,
    publishedDate: nullableString,
    license: nullableString,
    publicationPolicy: nullableString,
    publisher: z
      .object({
        name: nullableString,
      })
      .passthrough()
      .optional(),
    releases: z.array(z.unknown()).optional(),
    links: z
      .object({
        next: nullableString,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const canonicalCandidateSchema = z.object({
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

export type OcdsRelease = z.infer<typeof ocdsReleaseSchema>;
export type OcdsReleasePackage = z.infer<typeof ocdsReleasePackageSchema>;
