import AcSchedule from '../../components/AcSchedule';

// The live schedule the executor applies. The agent tunes it automatically; Luke
// can also edit blocks by hand here. (AcSchedule is the shared editor component.)
export default function Schedule() {
  return <AcSchedule />;
}
