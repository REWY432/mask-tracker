export type MaskModel = 's' | 'f' | 'e' | 'c';

export interface MaskRecord {
  id: string;
  type: 'm';
  model: MaskModel;
  generation: number;
  month: number;
  year: number;
  sequence: number;
  full_serial_number: string;
  size: string;
  contract: string;
  shipment: string;
  user_name: string;
  prod_date: string;
  created_at: string;
}
