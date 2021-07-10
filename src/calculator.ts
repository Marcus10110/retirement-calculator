const computeBasicInvestment = ({
  principal,
  rate,
  time,
  contribution,
}: {
  principal: number;
  rate: number;
  time: number;
  contribution: number;
}) => {
  return (
    principal * Math.pow(1 + rate, time) +
    contribution * ((Math.pow(1 + rate, time) - 1) / rate)
  );
};

const computeInflation = ({
  year,
  currentYear,
  inflation,
}: {
  year: number;
  currentYear: number;
  inflation: number;
}) => {
  return Math.pow(1 + inflation, year - currentYear);
};

const ageToYear = ({ age, birthYear }: { age: number; birthYear: number }) => {
  return birthYear + age;
};

const getSocialSecurity = ({
  retirementYear,
  birthYear,
}: {
  retirementYear: number;
  birthYear: number;
}) => {
  const age = retirementYear - birthYear;
  if (age >= 70) {
    return { year: ageToYear({ age: 70, birthYear }), monthly: 4194 };
  } else if (age >= 67) {
    return { year: ageToYear({ age: 68, birthYear }), monthly: 3383 };
  }
  return { year: ageToYear({ age: 62, birthYear }), monthly: 2374 };
};

const compute401kValue = ({
  year,
  currentYear,
  contributionLimit,
  match,
  interest,
  current401k,
}: {
  year: number;
  currentYear: number;
  contributionLimit: number;
  match: number;
  interest: number;
  current401k: number;
}) => {
  // annal contribution of 19.5k + 4% match
  const contribution = (contributionLimit + match) / 12;
  const years = year - currentYear;
  const r = interest / 12;
  const t = years * 12;
  return computeBasicInvestment({
    principal: current401k,
    rate: r,
    time: t,
    contribution,
  });
};

const money = (a: number) => {
  return `$${(Math.round(a * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
  })}`;
};

const simulateRetirement = ({
  age,
  birthYear,
  deathYear,
  currentYear,
  annualSpend,
  principal,
  inflation,
  contributionLimit,
  match,
  interest,
  current401k,
  debug = false,
}: {
  age: number;
  birthYear: number;
  deathYear: number;
  currentYear: number;
  annualSpend: number;
  principal: number;
  inflation: number;
  contributionLimit: number;
  match: number;
  interest: number;
  current401k: number;
  debug?: boolean;
}) => {
  // draw principal first, then draw 401K (which is taxed)
  const year = age + birthYear;
  annualSpend *= computeInflation({ year, currentYear, inflation }); // adjust to starting year dollars.
  const { year: ssStart, monthly } = getSocialSecurity({
    retirementYear: year,
    birthYear,
  });
  const start401k = ageToYear({ age: 60, birthYear });
  let principal401k = compute401kValue({
    year,
    currentYear,
    contributionLimit,
    match,
    interest,
    current401k,
  });
  let deficit = 0;
  if (debug) {
    console.log(
      `\nRetirement Simulation\nage: ${age}, annual spend: ${money(
        annualSpend
      )}, principal: ${money(principal)}`
    );
  }
  for (let i = year; i < deathYear; ++i) {
    let ssIncome = 0;
    let income401k = 0;

    if (i >= ssStart) {
      ssIncome =
        monthly *
        12 *
        computeInflation({ year: i, currentYear, inflation }) *
        0.65; // SS is taxed.
    }
    let thisYearSpendTarget = annualSpend;
    thisYearSpendTarget -= ssIncome;
    if (thisYearSpendTarget < 0) {
      thisYearSpendTarget = 0;
    }
    const principalContribution = Math.max(
      Math.min(thisYearSpendTarget, principal),
      0
    );
    thisYearSpendTarget -= principalContribution;
    principal -= principalContribution;
    let contribution401k = 0;
    if (i >= start401k) {
      if (thisYearSpendTarget > 0) {
        contribution401k = Math.max(
          Math.min(principal401k * 0.65, thisYearSpendTarget / 0.65),
          0
        );
        thisYearSpendTarget -= contribution401k * 0.65;
        principal401k -= contribution401k;
      }
    }
    if (debug) {
      console.log(
        `year: ${i}, annualSpend: ${money(annualSpend)} principal: ${money(
          principal
        )} principal401k: ${money(
          principal401k
        )} principal contribution: ${money(
          principalContribution
        )} 401k contribution: ${money(
          contribution401k
        )} SS contribution: ${money(ssIncome)} thisYearSpendTarget: ${money(
          thisYearSpendTarget
        )}${thisYearSpendTarget > 1 ? " BROKE" : ""}`
      );
    }
    principal += interest * principal;
    principal401k += interest * principal401k;
    annualSpend *= 1 + inflation; // adjust for 1 year inflation.
    deficit -= thisYearSpendTarget;
  }
  // TODO: make the model properly deal with 401K interest, and payouts.
  return principal + principal401k + deficit;
};

const midpoint = (a: number, b: number) => {
  return (a + b) / 2;
};
// produce a grid of retirement needs for different spends. returns principal required.
const computePrincipalForRequirement = (
  age: number,
  birthYear: number,
  currentYear: number,
  annualSpend: number,
  contributionLimit: number,
  current401k: number,
  deathYear: number,
  inflation: number,
  interest: number,
  match: number
) => {
  // detect zero case:
  if (
    simulateRetirement({
      age,
      annualSpend,
      principal: 0,
      birthYear,
      contributionLimit,
      current401k,
      currentYear,
      deathYear,
      inflation,
      interest,
      match,
    }) >= 0
  ) {
    return 0;
  }
  let iterationsLeft = 100;
  const maxDelta = 100e3;
  let maxGuess = 10e6;
  let minGuess = 1e3;
  let guess = midpoint(minGuess, maxGuess);
  while (true) {
    let output = simulateRetirement({
      age,
      annualSpend,
      principal: guess,
      birthYear,
      contributionLimit,
      current401k,
      currentYear,
      deathYear,
      inflation,
      interest,
      match,
    });
    // console.log(`guess: ${guess}, output: ${output}`)
    if (Math.abs(output) < maxDelta) return Math.round(guess);
    else if (output < 0) {
      minGuess = guess;
      guess = midpoint(guess, maxGuess);
    } else {
      maxGuess = guess;
      guess = midpoint(guess, minGuess);
    }
    iterationsLeft -= 1;
    if (iterationsLeft == 0) {
      throw Error(`didn't converge age: ${age}, annualSpend: ${annualSpend}`);
    }
  }
};

const ages = [40, 50, 60, 65, 67, 70];
const incomes = [100e3, 125e3, 150e3, 175e3, 200e3];

for (let age of ages) {
  for (let income of incomes) {
    const solution = computePrincipalForRequirement(
      age,
      1989,
      2021,
      income,
      19500,
      80000,
      1989 + 90,
      0.025,
      0.06,
      6800
    );
    console.log(
      `age: ${age} income: $${income.toLocaleString()}, requirement: $${solution.toLocaleString()}`
    );
  }
}

// Print out a year by year simulation:
simulateRetirement({
  age: 65,
  annualSpend: 125000,
  birthYear: 1989,
  contributionLimit: 19500,
  current401k: 80000,
  currentYear: 2021,
  deathYear: 1989 + 90,
  inflation: 0.025,
  interest: 0.06,
  match: 6800,
  principal: 1.5e6,
  debug: true,
});

simulateRetirement({
  age: 35,
  annualSpend: 100000,
  birthYear: 1989,
  contributionLimit: 19500,
  current401k: 80000,
  currentYear: 2021,
  deathYear: 1989 + 90,
  inflation: 0.025,
  interest: 0.06,
  match: 6800,
  principal: 2.5e6,
  debug: true,
});
