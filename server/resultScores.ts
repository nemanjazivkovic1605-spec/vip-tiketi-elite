type Score = { home?: number | null; away?: number | null };
const complete = (score?: Score) => Number.isInteger(score?.home) && Number.isInteger(score?.away)
  && Number(score?.home) >= 0 && Number(score?.away) >= 0;

// Pre-match full-time markets settle on 90 minutes, never extra time or penalties.
export const fullTimeFixtureScore = (fixture: {
  fixture?: { status?: { short?: string } }; score?: { fulltime?: Score }; goals?: Score;
}) => {
  const score = complete(fixture.score?.fulltime) ? fixture.score!.fulltime
    : !['AET', 'PEN'].includes(fixture.fixture?.status?.short || '') ? fixture.goals : undefined;
  return { homeScore: complete(score) ? score!.home! : null, awayScore: complete(score) ? score!.away! : null };
};

export const footballDataRegularScore = (score?: { duration?: string; regularTime?: Score; fullTime?: Score }) => {
  const regular = complete(score?.regularTime) ? score!.regularTime : score?.duration === 'REGULAR' ? score.fullTime : undefined;
  return { home: complete(regular) ? regular!.home! : null, away: complete(regular) ? regular!.away! : null };
};
