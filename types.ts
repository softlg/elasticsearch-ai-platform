export interface IndexInfo {
  name: string;
  health?: string;
  docs_count?: number;
  store_size?: string;
}

export interface MappingField {
  name: string;
  type: string;
  is_keyword: boolean;
  is_date: boolean;
  is_text: boolean;
}

export interface QueryResult {
  index: string;
  total: number;
  executed_dsl: Record<string, any>;
  dsl_explanation?: string;
  hits: Record<string, any>[];
  took_ms: number;
  from_user_dsl: boolean;
  from_?: number;
  size?: number;
  has_more?: boolean;
}

export interface AnalysisResult {
  summary: string;
  root_cause: string;
  suggestions: string[];
  severity?: string;
  raw?: string;
}
