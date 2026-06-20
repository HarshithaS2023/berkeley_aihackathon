type AnalyzeSourceRequest = {
  file: File;
};

type SourceProfile = {
  topics: string[];
  concepts: string[];
  styleNotes: string;
};

type QuizSettings = {
  numQuestions: number;

  problemType:
    | "definition"
    | "computation"
    | "word_problem";

  similarity:
    | "similar"
    | "different";

  startingDifficulty: number;
};

type GenerateQuestionRequest = {
  sourceProfile: SourceProfile;

  currentDifficulty: number;

  problemType:
    | "definition"
    | "computation"
    | "word_problem";

  similarity:
    | "similar"
    | "different";

  previousQuestions: string[];

  weakAreas: string[];
};

type Question = {
  id: string;

  question: string;

  hints: string[];

  answer: string;

  solution: string;

  difficulty: number;

  concepts: string[];
};

type AnalyzeWorkRequest = {
  question: Question;

  responseTimeSeconds: number;

  whiteboardImageBase64?: string;

  uploadedWorkFileBase64?: string;
};

type Feedback = {
  correct: boolean;

  feedback: string;

  errorPattern: string;

  suggestedNextStep: string;

  recommendedDifficulty: number;
};

type SessionResult = {
  question: Question;

  feedback: Feedback;

  responseTimeSeconds: number;
};

type SummaryRequest = {
  results: SessionResult[];
};

type SummaryResponse = {
  accuracy: number;

  mostMissedConcepts: string[];

  commonMistakes: string[];

  strengths: string[];

  suggestedNextSteps: string[];
};