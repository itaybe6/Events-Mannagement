import { AppLoader } from '@/components/AppLoader';

type Props = {
  visible: boolean;
  guestCount: number;
  tableNumber?: number | null;
};

/** @deprecated Use AppLoader with variant="seating" */
export function SeatingGuestsLoader({ visible, guestCount, tableNumber }: Props) {
  return (
    <AppLoader
      visible={visible}
      variant="seating"
      count={guestCount}
      tableNumber={tableNumber}
    />
  );
}
