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