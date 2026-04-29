import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { statusVariant } from '@/constants/statusMap';

describe('Button', () => {
  it.each([
    ['primary', 'md'],
    ['secondary', 'md'],
    ['danger', 'md'],
    ['ghost', 'md'],
    ['link', 'md'],
    ['primary', 'sm'],
    ['primary', 'lg'],
  ] as const)('renders variant=%s size=%s', (variant, size) => {
    render(
      <Button variant={variant} size={size}>
        Click
      </Button>,
    );
    const btn = screen.getByRole('button', { name: /click/i });
    expect(btn.getAttribute('data-variant')).toBe(variant);
    expect(btn.getAttribute('data-size')).toBe(size);
  });

  it('shows a spinner and disables interaction when loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('respects disabled', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('Badge / status map', () => {
  it.each(['success', 'warning', 'danger', 'info', 'neutral'] as const)(
    'renders variant=%s',
    (variant) => {
      render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByTestId('badge').getAttribute('data-variant')).toBe(variant);
    },
  );

  it('resolves a backend status string via the status map', () => {
    render(<Badge status="APPROVED">Approved</Badge>);
    expect(screen.getByTestId('badge').getAttribute('data-variant')).toBe('success');
  });

  it('falls back to neutral on unknown status', () => {
    render(<Badge status="UNKNOWN_STATUS_XYZ">Mystery</Badge>);
    expect(screen.getByTestId('badge').getAttribute('data-variant')).toBe('neutral');
  });

  it('statusVariant() lowercases input', () => {
    expect(statusVariant('APPROVED')).toBe('success');
    expect(statusVariant('approved')).toBe('success');
    expect(statusVariant(null)).toBe('neutral');
    expect(statusVariant(undefined)).toBe('neutral');
  });

  it('renders a colored dot prefix when dot=true', () => {
    const { container } = render(
      <Badge variant="success" dot>
        Active
      </Badge>,
    );
    const dot = container.querySelector('span[aria-hidden="true"]');
    expect(dot).toBeTruthy();
  });
});

describe('Input', () => {
  it('renders the label and links it to the field', () => {
    render(<Input label="Email" />);
    const input = screen.getByLabelText(/email/i);
    expect(input).toBeInTheDocument();
  });

  it('shows error message and sets aria-invalid', () => {
    render(<Input label="Email" error="Email is taken." />);
    const input = screen.getByLabelText(/email/i);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert')).toHaveTextContent(/taken/i);
  });

  it('renders an asterisk when required', () => {
    render(<Input label="Email" required />);
    const label = screen.getByText(/email/i);
    expect(label.textContent).toContain('*');
  });
});

describe('Select', () => {
  it('renders options and supports selection', async () => {
    render(
      <Select label="Role" defaultValue="ADMIN">
        <option value="ADMIN">Admin</option>
        <option value="ESTIMATOR">Estimator</option>
      </Select>,
    );
    const select = screen.getByLabelText(/role/i) as HTMLSelectElement;
    expect(select.value).toBe('ADMIN');
    await userEvent.selectOptions(select, 'ESTIMATOR');
    expect(select.value).toBe('ESTIMATOR');
  });
});

describe('Textarea', () => {
  it('renders a character count when showCount + maxLength are set', () => {
    render(<Textarea label="Notes" maxLength={500} value="hi" onChange={() => {}} showCount />);
    expect(screen.getByText('2 / 500')).toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('does not render when open=false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        body
      </Modal>,
    );
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders title + body + footer when open', () => {
    render(
      <Modal
        open
        onClose={() => {}}
        title="Confirm"
        footer={<Modal.Footer onCancel={() => {}} onPrimary={() => {}} primaryLabel="Go" />}
      >
        Body content
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByText(/body content/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go/i })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        x
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click by default', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        x
      </Modal>,
    );
    await userEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Card', () => {
  it('renders title + actions + body + footer', () => {
    render(
      <Card title="Hello" actions={<Button size="sm">Action</Button>} footer={<span>Footer</span>}>
        Body
      </Card>,
    );
    expect(screen.getByRole('heading', { name: /hello/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /action/i })).toBeInTheDocument();
    expect(screen.getByText(/body/i)).toBeInTheDocument();
    expect(screen.getByText(/footer/i)).toBeInTheDocument();
  });
});

describe('TitleBlock', () => {
  it('renders title + subtitle + actions', () => {
    render(
      <TitleBlock title="Estimates" subtitle="All your work in flight" actions={<Button>New</Button>} />,
    );
    expect(screen.getByRole('heading', { name: /estimates/i })).toBeInTheDocument();
    expect(screen.getByText(/all your work/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
  });
});

describe('Table', () => {
  it('renders rows with data', () => {
    render(
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
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByText(/alpha/i)).toBeInTheDocument();
  });

  it('clickable row fires onRowClick', async () => {
    const onRowClick = vi.fn();
    render(
      <Table>
        <Table.Body>
          <Table.Row onRowClick={onRowClick}>
            <Table.Cell>Click me</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    );
    await userEvent.click(screen.getByText(/click me/i));
    expect(onRowClick).toHaveBeenCalled();
  });
});

describe('EmptyState', () => {
  it('renders title + description + CTA', async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="No estimates yet"
        description="Create your first estimate to get started."
        actionLabel="New estimate"
        onAction={onAction}
      />,
    );
    expect(screen.getByText(/no estimates yet/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /new estimate/i }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('Loading skeletons', () => {
  it('Skeleton renders with width + aria-hidden', () => {
    render(<Skeleton width="50%" />);
    const s = screen.getByTestId('skeleton');
    expect(s).toHaveStyle({ width: '50%' });
    expect(s.getAttribute('aria-hidden')).toBe('true');
  });

  it('SkeletonCard has the requested rows', () => {
    render(<SkeletonCard rows={4} />);
    const card = screen.getByTestId('skeleton-card');
    expect(card.querySelectorAll('[data-testid="skeleton"]')).toHaveLength(2 + 4);
  });
});

describe('Avatar', () => {
  it('renders initials when no src', () => {
    render(<Avatar name="Adam Mark" />);
    expect(screen.getByTestId('avatar').textContent).toBe('AM');
  });

  it('renders an image when src is provided', () => {
    render(<Avatar name="Adam" src="https://example.com/a.png" />);
    const img = screen.getByRole('img', { name: /adam/i });
    expect(img.getAttribute('src')).toBe('https://example.com/a.png');
  });

  it('uses ? for empty names', () => {
    render(<Avatar name="" />);
    expect(screen.getByTestId('avatar').textContent).toBe('?');
  });
});
