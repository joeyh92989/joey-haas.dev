// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ibtn } from '../addClasses.js'
import {
  CONF,
  CONF_STATE,
  INTAKE_WAITING,
  INTAKE_WITHDRAWER,
  INTAKE_DRAWER_SHEET,
  METER_PART,
} from '../intakeClasses.js'
import { INTAKE_DEMO_SPINE } from '../intakeDemoClasses.js'
import * as intake from '../intakeClasses.js'
import * as demo from '../intakeDemoClasses.js'
import * as forms from '../intakeFormClasses.js'

// The intake look is utilities now (#536, slice D5b); these pin the choices
// that are not visible in the markup. The measured ratios are recorded in the
// class modules' header comments.

const all = { ...intake, ...demo, ...forms }

describe('intake styles', () => {
  it('colors with tokens only (AC 13)', () => {
    const text = JSON.stringify(all)
    expect(text).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
  })

  it('draws "still reading" in the measured token, not --line-strong', () => {
    expect(METER_PART.reading).toBe('bg-(--status-backlog)')
    // The ratios are recorded beside the classes.
    expect(String(intake.INTAKE_METER)).not.toContain('line-strong')
  })

  it('puts the drawer beside the grid, and a fixed sheet below 900px', () => {
    expect(INTAKE_WITHDRAWER).toContain(
      "[&[data-drawer='open']]:grid-cols-[minmax(0,1fr)_340px]",
    )
    expect(INTAKE_DRAWER_SHEET).toContain('fixed')
  })

  it('records the add bar’s text on --accent-soft (the waiting line)', () => {
    expect(INTAKE_WAITING).toContain('bg-(--accent-soft)')
  })

  it('gives the add bar, drawer and Clothes Check 44px targets on a phone', () => {
    // The buttons say it themselves (ibtn, #535); no rule of the block does.
    expect(ibtn('plain')).toContain('max-[900px]:min-h-11')
  })

  it('draws the public demo in tokens, with its spine text on --sunken', () => {
    expect(INTAKE_DEMO_SPINE).toContain('bg-(--sunken)')
    expect(INTAKE_DEMO_SPINE).toContain('text-(--text)')
  })

  it('draws every confidence in a text token measured on the surfaces', () => {
    expect(CONF).toContain('border-current')
    expect(Object.values(CONF_STATE)).toEqual([
      'text-(--ok-text)',
      'text-(--accent-text)',
      'text-(--badge)',
      'text-(--text-3)',
    ])
  })
})
