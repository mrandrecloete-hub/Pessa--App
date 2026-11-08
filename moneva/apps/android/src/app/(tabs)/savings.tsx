import { Body, EmptyState, H1, Screen } from '@/components/ui';

export default function Savings() {
  return (
    <Screen>
      <H1>Savings</H1>
      <EmptyState
        title="Savings goals are not built yet"
        message="Goals, contributions, challenges and the discipline score are Stage 5. Nothing on this page is working data."
      />
      <Body muted>Savings allocations will be internal bookkeeping and will never be shown as a bank transfer.</Body>
    </Screen>
  );
}
