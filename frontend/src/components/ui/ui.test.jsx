import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Link } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Badge } from './badge.jsx'
import { Button } from './button.jsx'
import { buttonVariants } from './button-variants.js'
import { Card, CardContent, CardHeader, CardTitle } from './card.jsx'
import { Input } from './input.jsx'
import { Separator } from './separator.jsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.jsx'

// jsdom has no stylesheet for utilities, so these pin the look by class: the
// token-backed utility that carries it, and the generated classes that must be
// gone (docs/design-system.md; the flat Archive look, #528).
const GENERATED_LOOK =
  /rounded-4xl|rounded-3xl|rounded-full|shadow-|ring-foreground/

afterEach(() => vi.restoreAllMocks())

describe('Button', () => {
  // Tailwind sorts border-transparent after every named border colour, so a
  // base class of it hides each variant's outline (#529). Colour lives on the
  // variants that mean it; the e2e suite measures the computed border.
  it('has no border-transparent in its base class', () => {
    expect(buttonVariants({ variant: 'outline' })).not.toContain(
      'border-transparent',
    )
    expect(buttonVariants({ variant: 'ghost' })).toContain('border-transparent')
  })

  it('renders the nav and link variants without the default size', () => {
    render(
      <>
        <Button variant="nav">Nav</Button>
        <Button variant="link">Link</Button>
      </>,
    )
    for (const name of ['Nav', 'Link'])
      expect(screen.getByRole('button', { name }).className).not.toMatch(
        /\bh-9\b|\bpx-4\b|\bgap-2\b/,
      )
  })

  it('gives the nav and link variants no box padding or height of their own', () => {
    for (const variant of ['nav', 'link']) {
      const cls = buttonVariants({ variant, size: 'bare' })
      expect(cls).not.toMatch(/\bh-9\b|\bpx-4\b/)
    }
  })

  it('is flat: a token fill, 6px-or-less radius, no shadow', () => {
    render(<Button>Save</Button>)
    const cls = screen.getByRole('button', { name: 'Save' }).className
    expect(cls).toContain('bg-primary')
    expect(cls).toContain('text-primary-foreground')
    expect(cls).toContain('rounded-md')
    expect(cls).not.toMatch(GENERATED_LOOK)
  })

  it.each([
    ['outline', 'border-foreground'],
    ['secondary', 'bg-secondary'],
    ['ghost', 'text-muted-foreground'],
    ['destructive', 'text-destructive'],
    ['link', 'text-accent-text'],
  ])('%s variant carries %s', (variant, cls) => {
    render(<Button variant={variant}>Go</Button>)
    expect(screen.getByRole('button').className).toContain(cls)
  })

  it('never sets coloured text from a plain mark token or an opacity', () => {
    render(<Button variant="link">Go</Button>)
    expect(screen.getByRole('button').className).not.toMatch(
      /text-primary(?!-foreground)|text-[\w-]+\/\d/,
    )
  })

  it('is a link without a console warning when rendered as one', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <MemoryRouter>
        <Button nativeButton={false} render={<Link to="/shelf" />}>
          Shelf
        </Button>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Shelf' })).toHaveAttribute(
      'href',
      '/shelf',
    )
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not fire when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Badge', () => {
  it('is a small mono label with an outline', () => {
    render(<Badge>Beta</Badge>)
    const cls = screen.getByText('Beta').className
    expect(cls).toContain('font-mono')
    expect(cls).toContain('border-line-card')
    expect(cls).not.toMatch(GENERATED_LOOK)
  })

  it.each([
    ['outline', 'bg-transparent'],
    ['accent', 'bg-primary'],
  ])('%s variant carries %s', (variant, cls) => {
    render(<Badge variant={variant}>Tag</Badge>)
    expect(screen.getByText('Tag').className).toContain(cls)
  })

  it('accent badge text is the ink on the fill', () => {
    render(<Badge variant="accent">Tag</Badge>)
    expect(screen.getByText('Tag').className).toContain(
      'text-primary-foreground',
    )
  })
})

describe('Input', () => {
  it('takes a label, a value and typing', async () => {
    render(
      <>
        <label htmlFor="q">Search</label>
        <Input id="q" />
      </>,
    )
    await userEvent.type(screen.getByLabelText('Search'), 'dredge')
    expect(screen.getByLabelText('Search')).toHaveValue('dredge')
  })

  it('is a 1px outlined field on the card colour', () => {
    render(<Input aria-label="Title" />)
    const cls = screen.getByLabelText('Title').className
    expect(cls).toContain('border-foreground')
    expect(cls).toContain('bg-card')
    expect(cls).not.toMatch(GENERATED_LOOK)
  })
})

describe('Tabs', () => {
  function tabs() {
    return render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">One</TabsTrigger>
          <TabsTrigger value="b">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="a">First</TabsContent>
        <TabsContent value="b">Second</TabsContent>
      </Tabs>,
    )
  }

  it('selects the first tab and shows its panel', () => {
    tabs()
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('First')).toBeVisible()
  })

  it('moves focus with the arrow keys and selects with Enter', async () => {
    tabs()
    screen.getByRole('tab', { name: 'One' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('underlines the active tab with a 3px accent bar, not a pill', () => {
    tabs()
    const cls = screen.getByRole('tab', { name: 'One' }).className
    expect(cls).toContain('data-active:after:block')
    expect(cls).toContain('after:h-[3px]')
    expect(cls).toContain('after:bg-primary')
    expect(cls).not.toMatch(GENERATED_LOOK)
  })
})

describe('Separator', () => {
  it('is a 1px rule on the line colour', () => {
    render(<Separator data-testid="rule" />)
    const rule = screen.getByTestId('rule')
    expect(rule.className).toContain('bg-border')
    expect(rule).toHaveAttribute('role', 'separator')
  })
})

describe('Card', () => {
  it('is a flat 1px outline on the card colour', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>,
    )
    const cls = screen.getByTestId('card').className
    expect(cls).toContain('border-border')
    expect(cls).toContain('bg-card')
    expect(cls).toContain('rounded-md')
    expect(cls).not.toMatch(GENERATED_LOOK)
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('rules inside a card use the card line', () => {
    render(
      <Card>
        <CardHeader data-testid="head" className="border-b">
          x
        </CardHeader>
      </Card>,
    )
    expect(screen.getByTestId('head').className).toContain('border-line-card')
  })
})
