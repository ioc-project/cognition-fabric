import {z} from 'zod';

/**
 * Backend response schemas for reasoning history.
 * These handle the dynamic backend structure until it stabilizes.
 */

// Schema for concept data from backend
export const ConceptSchema = z
  .object({
    concept_id: z.string(),
    name: z.string(),
    type: z.string().optional(),
    description: z.string().optional(),
    attributes: z
      .object({
        domain: z.string().optional()
      })
      .optional()
  })
  .passthrough(); // Allow additional fields

// Schema for relation data from backend
export const RelationSchema = z
  .object({
    id: z.string(),
    relationship: z.string(),
    attributes: z
      .object({
        source_name: z.string().optional(),
        target_name: z.string().optional()
      })
      .optional()
  })
  .passthrough();

export const ConceptsTopKResultSchema = z
  .object({
    concept: ConceptSchema.optional(),
    neighbor_concepts: z.array(ConceptSchema).optional(),
    relations: z.array(RelationSchema).optional()
  })
  .passthrough();

export const ConceptsTopKSchema = z
  .object({
    results: z.array(ConceptsTopKResultSchema).optional()
  })
  .passthrough();

export type Concept = z.infer<typeof ConceptSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type ConceptsTopKResult = z.infer<typeof ConceptsTopKResultSchema>;
export type ConceptsTopK = z.infer<typeof ConceptsTopKSchema>;
