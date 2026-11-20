import { describe, expect, it } from 'vitest'
import { experience, homeExperience } from './experience.js'
import { profile } from './profile.js'

const entry = (company, role, meta, short, extra = {}) => ({
  company,
  role,
  meta,
  short,
  summary: `The long version of ${role}.`,
  ...extra,
})

const RECENT = [
  entry('Acme', 'Senior', '2021 – present · Denver, CO', 'Owns the ledger.'),
  entry('Acme', 'PM', '2019 – 2021 · Denver, CO', 'Ran payments.'),
]

const EARLIER = [
  entry('Beta Corp', 'PM', '2016 – 2019 · Denver, CO', 'shipped the app', {
    earlier: true,
  }),
  entry('Gamma Communications', 'PM', '2012 – 2016 · Denver, CO', 'ran video', {
    earlier: true,
    companyShort: 'Gamma',
  }),
]

describe('homeExperience', () => {
  it('gives each recent role its own row with the short line', () => {
    expect(homeExperience(RECENT)).toEqual([
      {
        key: 'Acme-Senior',
        dates: '2021 – present',
        title: 'Acme — Senior',
        summary: 'Owns the ledger.',
      },
      {
        key: 'Acme-PM',
        dates: '2019 – 2021',
        title: 'Acme — PM',
        summary: 'Ran payments.',
      },
    ])
  })

  it('folds the earlier roles into one row spanning their years', () => {
    const rows = homeExperience([...RECENT, ...EARLIER])
    expect(rows).toHaveLength(3)
    expect(rows[2]).toEqual({
      key: 'earlier',
      dates: '2012 – 2019',
      title: 'Beta Corp · Gamma — Product management',
      summary: 'Shipped the app; ran video.',
    })
  })
})

describe('the experience content', () => {
  const roleBullets = experience.flatMap((entry) =>
    (entry.roles ?? []).map((role) => role.bullets),
  )

  it('gives every entry bullets or roles, never both or neither', () => {
    for (const entry of experience) {
      expect(
        Boolean(entry.bullets) !== Boolean(entry.roles),
        `${entry.company} needs exactly one of bullets or roles`,
      ).toBe(true)
      if (entry.roles) {
        expect(entry.blurb, `${entry.company} needs a blurb`).toBeTruthy()
        expect(entry.roles.length).toBeGreaterThan(1)
      }
    }
  })

  it('marks exactly one present role across the timeline', () => {
    const marked = experience.flatMap((entry) => [
      ...(entry.current ? [entry.company] : []),
      ...(entry.roles ?? []).filter((role) => role.current),
    ])
    expect(marked).toHaveLength(1)
  })

  it('has no empty bullet, title or date', () => {
    const lists = [
      ...roleBullets,
      ...experience.flatMap((entry) => entry.bullets ?? []).map((b) => [b]),
    ]
    for (const bullets of lists) {
      expect(bullets.length).toBeGreaterThan(0)
      for (const bullet of bullets) expect(bullet.trim()).not.toBe('')
    }
    for (const entry of experience) {
      for (const role of entry.roles ?? []) {
        expect(role.title.trim()).not.toBe('')
        expect(role.dates.trim()).not.toBe('')
      }
    }
  })

  it('keeps expertise and toolbox from repeating an entry', () => {
    const all = [...profile.expertise, ...profile.toolbox]
    expect(new Set(all).size).toBe(all.length)
  })

  it('leaves Home with the same three rows', () => {
    expect(homeExperience()).toEqual([
      {
        key: 'Guild-Software Engineer I → II → Senior',
        dates: '2021 – present',
        title: 'Guild — Software Engineer I → II → Senior',
        summary:
          'Owned the APIs behind about $1B in annual benefit spend and cut a bulk endpoint’s latency 55–74%. Led the ledger’s move to a new eligibility platform.',
      },
      {
        key: 'Guild-Product Manager, Payment Products',
        dates: '2020 – 2021',
        title: 'Guild — Product Manager, Payment Products',
        summary:
          'Balance tracking and external-benefits administration for Fortune 1000 customers.',
      },
      {
        key: 'earlier',
        dates: '2012 – 2019',
        title: 'MJ Freeway · Charter · iBAHN — Product management',
        summary:
          'Core-suite product owner; set-top video guides; in-room hospitality video.',
      },
    ])
  })
})

describe('Home’s Guild row', () => {
  const guild = experience.find((entry) => entry.company === 'Guild')
  const [engineer] = guild.homeRows

  it('carries only the two figures already public on About', () => {
    expect(engineer.short).toContain('$1B')
    expect(engineer.short).toContain('55–74%')
    expect(engineer.short).not.toMatch(/\d[\d,.]*\s*(M|K)\b|rows?\b/)
  })

  it('keeps the two-row Guild structure', () => {
    expect(guild.homeRows).toHaveLength(2)
  })
})
