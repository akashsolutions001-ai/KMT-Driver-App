export type StopStatus = 'reached' | 'current' | 'pending';

export interface Stop {
  id: string;
  name: string;
  status: StopStatus;
  order: number;
  latitude?: number;
  longitude?: number;
}

export interface RouteInfo {
  id: string;
  name: string;
  busNumber: string;
  stops: Stop[];
}

export interface DriverInfo {
  id: string;
  name: string;
  route: RouteInfo;
}

export type RouteState = 'not_started' | 'in_progress' | 'completed';
