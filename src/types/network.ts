export interface NetworkStatusData {
  isOnline: boolean;
  responseTime: number;
  lastChecked: number;
  quality: 'online' | 'poor' | 'offline';
}
