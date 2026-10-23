import { describe, expect, it } from 'vitest'
import { homeExperience } from './experience.js'

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
