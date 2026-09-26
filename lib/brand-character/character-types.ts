// Radar Creative AI - Character Pack
// Tipos puros (sem I/O, sem dependencia de Supabase) para a metadata rica
// das referencias visuais da Garota Radar. Ficam num arquivo proprio (e
// nao dentro de lib/brand-assets/types.ts) porque so fazem sentido para
// referencias de PERSONAGEM - um LOGO ou um VIDEO_OUTRO nunca tem
// expression/pose/shot.

export type CharacterExpression =
  | "NEUTRAL"
  | "SMILING"
  | "HAPPY"
  | "EXCITED"
  | "SURPRISED"
  | "THOUGHTFUL"
  | "CONFIDENT"
  | "WINKING"
  | "INVITING"
  | "SERIOUS";

export const CHARACTER_EXPRESSIONS: CharacterExpression[] = [
  "NEUTRAL",
  "SMILING",
  "HAPPY",
  "EXCITED",
  "SURPRISED",
  "THOUGHTFUL",
  "CONFIDENT",
  "WINKING",
  "INVITING",
  "SERIOUS",
];

export type CharacterPose =
  | "NEUTRAL"
  | "ARMS_CROSSED"
  | "HANDS_IN_POCKETS"
  | "POINTING"
  | "POINTING_UP"
  | "POINTING_DOWN"
  | "PRESENTING"
  | "INVITING"
  | "THUMBS_UP"
  | "HAND_ON_CHIN"
  | "CELEBRATING"
  | "WALKING"
  | "LEANING"
  | "OTHER";

export const CHARACTER_POSES: CharacterPose[] = [
  "NEUTRAL",
  "ARMS_CROSSED",
  "HANDS_IN_POCKETS",
  "POINTING",
  "POINTING_UP",
  "POINTING_DOWN",
  "PRESENTING",
  "INVITING",
  "THUMBS_UP",
  "HAND_ON_CHIN",
  "CELEBRATING",
  "WALKING",
  "LEANING",
  "OTHER",
];

export type CharacterShot =
  | "CLOSE_UP"
  | "HEADSHOT"
  | "BUST"
  | "HALF_BODY"
  | "THREE_QUARTER_BODY"
  | "FULL_BODY";

export const CHARACTER_SHOTS: CharacterShot[] = [
  "CLOSE_UP",
  "HEADSHOT",
  "BUST",
  "HALF_BODY",
  "THREE_QUARTER_BODY",
  "FULL_BODY",
];

export type CharacterCameraAngle = "FRONT" | "THREE_QUARTER" | "PROFILE" | "OTHER";

export const CHARACTER_CAMERA_ANGLES: CharacterCameraAngle[] = [
  "FRONT",
  "THREE_QUARTER",
  "PROFILE",
  "OTHER",
];

// outfit e environment sao propositalmente strings livres (nao enum) para
// crescer sem precisar de mudanca de tipo - ver instrucao do dono.
export type CharacterReferenceCriteria = {
  characterSlug?: string;
  expression?: CharacterExpression;
  pose?: CharacterPose;
  shot?: CharacterShot;
  cameraAngle?: CharacterCameraAngle;
  outfit?: string;
  environment?: string;

  // Filtro de ELEGIBILIDADE (nao um campo pontuado como os acima) - quando
  // true, so referencias com metadata.generationSafe===true competem. Ver
  // selectBestFromCandidates() em character-pack-scoring.ts.
  generationSafe?: boolean;
};

export type CharacterReferenceCandidate = {
  id: string;
  metadata: {
    characterId?: string;
    characterSlug?: string;
    referenceType?: string;
    isPrimary?: boolean;
    expression?: CharacterExpression;
    pose?: CharacterPose;
    shot?: CharacterShot;
    cameraAngle?: CharacterCameraAngle;
    genderPresentation?: string;
    outfit?: string;
    environment?: string;
    tags?: string[];
    description?: string;
    sha256?: string;
    generationSafe?: boolean;
  };
};

export type ScoredCharacterReference<T extends CharacterReferenceCandidate = CharacterReferenceCandidate> = {
  asset: T;
  score: number;
  matchedFields: string[];
  reasons: string[];
};
