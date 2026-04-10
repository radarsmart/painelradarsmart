export const UGC_VOICES = {
  mateus: {
    id: "F7823wtD50WK1gnmgBk5",
    name: "Mateus Moretti",
    style: "masculino animado",
    defaultVoice: true
  },
  ana_dias: {
    id: "MZxV5lN3cv7hi1376O0m", 
    name: "Ana Dias",
    style: "feminino casual"
  },
  paulo: {
    id: "Qrdut83w0Cr152Yb4Xn3",
    name: "Paulo",
    style: "masculino neutro"
  },
  ana_alice: {
    id: "ORgG8rwdAiMYRug8RJwR",
    name: "Ana Alice", 
    style: "feminino expressivo"
  },
  will: {
    id: "NNbmtunmMPGBeyrKu6KD",
    name: "Will Dynamic",
    style: "masculino dinâmico"
  }
} as const;

export type VoiceKey = keyof typeof UGC_VOICES;
