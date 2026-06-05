import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
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
  SkeletonText,
  SkeletonRow,
  SkeletonMetric,
  Table,
  Textarea,
  TitleBlock,
} from '@/components/ui';

describe('Button snapshots', () => {
  it.each(['primary', 'secondary', 'danger', 'ghost', 'link'] as const)(
    'variant=%s',
    (variant) => {
      const { container } = render(<Button variant={variant}>Label</Button>);
      expect(container.firstChild).toMatchSnapshot();
    },
  );

  it.each(['sm', 'md', 'lg'] as const)('size=%s', (size) => {
    const { container } = render(<Button size={size}>Label</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('loading', () => {
    const { container } = render(<Button loading>Save</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('disabled', () => {
    const { container } = render(<Button disabled>Save</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('fullWidth with icons', () => {
    const { container } = render(
      <Button fullWidth leftIcon={<span>+</span>} rightIcon={<span>→</span>}>
        Create
      </Button>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('Badge snapshots', () => {
  it.each(['success', 'warning', 'danger', 'info', 'neutral'] as const)(
    'variant=%s',
    (variant) => {
      const { container } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(container.firstChild).toMatchSnapshot();
    },
  );

  it.each(['sm', 'md', 'lg'] as const)('size=%s', (size) => {
    const { container } = render(
      <Badge variant="info" size={size}>
        {size}
      </Badge>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('with dot', () => {
    const { container } = render(
      <Badge variant="success" dot>
        Active
      </Badge>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('status resolution', () => {
    const { container } = render(<Badge status="APPROVED">Approved</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('Input snapshots', () => {
  it('default', () => {
    const { container } = render(<Input label="Email" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('with error', () => {
    const { container } = render(<Input label="Email" error="Required" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('with help text', () => {
    const { container } = render(<Input label="Name" helpText="As shown on your ID." />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('required', () => {
    const { container } = render(<Input label="Email" required />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('Select snapshot', () => {
  it('default', () => {
    const { container } = render(
      <Select label="Role">
        <option value="ADMIN">Admin</option>
        <option value="MEMBER">Member</option>
      </Select>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('Textarea snapshots', () => {
  it('default', () => {
    const { container } = render(<Textarea label="Notes" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('with character count', () => {
    const { container } = render(
      <Textarea label="Notes" maxLength={500} value="hello" onChange={() => {}} showCount />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('Modal snapshots', () => {
  it('open with footer', () => {
    const { container } = render(
      <Modal
        open
        onClose={() => {}}
        title="Confirm"
        footer={<Modal.Footer onCancel={() => {}} onPrimary={() => {}} primaryLabel="OK" />}
      >
        Body
      </Modal>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('Card snapshots', () => {
  it('with title + actions + body + footer', () => {
    const { container } = render(
      <Card title="Title" actions={<Button size="sm">Act</Button>} footer={<span>Foot</span>}>
        Body
      </Card>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('minimal', () => {
    const { container } = render(<Card>Body only</Card>);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('TitleBlock snapshots', () => {
  it('full', () => {
    const { container } = render(
      <TitleBlock
        title="Estimates"
        subtitle="All work in flight"
        actions={<Button>New</Button>}
        badge={<Badge variant="info">Beta</Badge>}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('minimal', () => {
    const { container } = render(<TitleBlock title="Dashboard" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('Table snapshot', () => {
  it('renders correctly', () => {
    const { container } = render(
      <Table>
        <Table.Head>
          <tr>
            <Table.Header>Name</Table.Header>
          </tr>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Alpha</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('EmptyState snapshots', () => {
  it('with CTA', () => {
    const { container } = render(
      <EmptyState
        title="No estimates"
        description="Create one to get started."
        actionLabel="New estimate"
        onAction={() => {}}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('minimal', () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('Skeleton snapshots', () => {
  it('Skeleton', () => {
    const { container } = render(<Skeleton width="60%" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('SkeletonText', () => {
    const { container } = render(<SkeletonText lines={3} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('SkeletonRow', () => {
    const { container } = render(<SkeletonRow />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('SkeletonCard', () => {
    const { container } = render(<SkeletonCard rows={3} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('SkeletonMetric', () => {
    const { container } = render(<SkeletonMetric />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('Avatar snapshots', () => {
  it('initials', () => {
    const { container } = render(<Avatar name="Adam Mark" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('with image', () => {
    const { container } = render(<Avatar name="Adam" src="https://example.com/a.png" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('empty name', () => {
    const { container } = render(<Avatar name="" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
