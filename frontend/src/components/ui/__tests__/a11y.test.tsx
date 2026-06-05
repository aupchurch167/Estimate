import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import * as matchers from 'vitest-axe/matchers';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Assertion<T> extends AxeMatchers {}
}
interface AxeMatchers {
  toHaveNoViolations(): void;
}
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  SkeletonCard,
  Table,
  Textarea,
  TitleBlock,
} from '@/components/ui';

expect.extend(matchers);

describe('UI primitives accessibility (axe-core)', () => {
  it('Button — all variants', async () => {
    const { container } = render(
      <div>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Badge — all variants', async () => {
    const { container } = render(
      <div>
        <Badge variant="success">Active</Badge>
        <Badge variant="warning">Review</Badge>
        <Badge variant="danger">Error</Badge>
        <Badge variant="info">Info</Badge>
        <Badge variant="neutral">Draft</Badge>
        <Badge variant="success" dot>With dot</Badge>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Input — default, error, required', async () => {
    const { container } = render(
      <div>
        <Input label="Email" />
        <Input label="Name" error="Required" required />
        <Input label="Bio" helpText="Short summary" />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Select', async () => {
    const { container } = render(
      <Select label="Role">
        <option value="ADMIN">Admin</option>
        <option value="MEMBER">Member</option>
      </Select>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Textarea', async () => {
    const { container } = render(
      <Textarea label="Notes" maxLength={500} value="hello" onChange={() => {}} showCount />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Modal (open)', async () => {
    const { container } = render(
      <Modal
        open
        onClose={() => {}}
        title="Confirm action"
        footer={<Modal.Footer onCancel={() => {}} onPrimary={() => {}} primaryLabel="OK" />}
      >
        Are you sure?
      </Modal>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Card', async () => {
    const { container } = render(
      <Card title="Settings">
        <p>Content</p>
      </Card>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('TitleBlock', async () => {
    const { container } = render(
      <TitleBlock
        title="Estimates"
        subtitle="All work"
        actions={<Button>New</Button>}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Table', async () => {
    const { container } = render(
      <Table>
        <Table.Head>
          <tr>
            <Table.Header>Name</Table.Header>
            <Table.Header>Status</Table.Header>
          </tr>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Alpha</Table.Cell>
            <Table.Cell>Active</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('EmptyState', async () => {
    const { container } = render(
      <EmptyState
        title="No data"
        description="Nothing to show."
        actionLabel="Create"
        onAction={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Skeleton', async () => {
    const { container } = render(
      <div>
        <Skeleton width="60%" />
        <SkeletonCard rows={3} />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Avatar', async () => {
    const { container } = render(
      <div>
        <Avatar name="Adam Mark" />
        <Avatar name="Jane" src="https://example.com/j.png" />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
