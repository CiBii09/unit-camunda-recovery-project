export interface DashboardMetrics {
  activeEpisodes: string;
  dataFreshnessRate: string;
  suppressionRate: string;
  uiLatency: string;
  eventIntakeRate: number;
  smsDelivered24h: number;
}

export interface HelpQueueTask {
  id: string;
  opaqueRefId: string;
  maskedPhone: string;
  priority: string;
  episodeStatus: string;
  createdAt: string;
  age: number;
  latestSummary: string;
}

export interface CamundaTask {
  id: string;
  taskDefinitionKey: string;
  name: string;
  assignee?: string;
  created: string;
  opaqueRef: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface ApplicantDetails {
  opaqueRef: string;
  maskedPhone: string;
  status: string;
  dataAgeSeconds: number;
}

export interface TimerItem {
  id: string;
  opaqueRef: string;
  timeRemaining: string;
  status: string;
  progressPercent: number;
}