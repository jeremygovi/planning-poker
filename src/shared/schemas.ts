import { Type } from '@sinclair/typebox';

const AvatarKeySchema = Type.Union([
  Type.Literal('train'), Type.Literal('rocket'), Type.Literal('robot'), Type.Literal('fox'),
  Type.Literal('owl'), Type.Literal('cat'), Type.Literal('cactus'), Type.Literal('comet'),
  Type.Literal('frog'), Type.Literal('panda'), Type.Literal('alien'), Type.Literal('pirate')
]);

const AvatarImageSchema = Type.Union([
  Type.String({ minLength: 1, maxLength: 48_000, pattern: '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' }),
  Type.Null()
]);

export const LoginBodySchema = Type.Object({ token: Type.String({ minLength: 16, maxLength: 128 }) }, { additionalProperties: false });

export const CreateRoomBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 80 }),
  theme: Type.Optional(Type.Union([Type.Literal('classic'), Type.Literal('train'), Type.Literal('station'), Type.Literal('turbo')])),
  defaultDeckKey: Type.Optional(Type.Union([
    Type.Literal('fibonacci'), Type.Literal('scrum'), Type.Literal('powers'), Type.Literal('tshirt')
  ]))
}, { additionalProperties: false });

export const UpdateRoomBodySchema = Type.Partial(Type.Object({
  name: Type.String({ minLength: 1, maxLength: 80 }),
  theme: Type.Union([Type.Literal('classic'), Type.Literal('train'), Type.Literal('station'), Type.Literal('turbo')]),
  soundEnabled: Type.Boolean(),
  defaultDeckKey: Type.Union([
    Type.Literal('fibonacci'), Type.Literal('scrum'), Type.Literal('powers'), Type.Literal('tshirt')
  ])
}, { additionalProperties: false }));

export const JoinRoomBodySchema = Type.Object({
  displayName: Type.String({ minLength: 1, maxLength: 40 }),
  role: Type.Union([Type.Literal('voter'), Type.Literal('observer')]),
  avatar: AvatarKeySchema,
  avatarImage: Type.Optional(AvatarImageSchema)
}, { additionalProperties: false });

export const ProfileBodySchema = Type.Object({
  displayName: Type.String({ minLength: 1, maxLength: 40 }),
  avatar: AvatarKeySchema,
  avatarImage: AvatarImageSchema
}, { additionalProperties: false });

export const RejoinRoomBodySchema = Type.Object({ token: Type.String({ minLength: 32, maxLength: 128 }) }, { additionalProperties: false });

export const StartStoryBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 2048 }),
  timerDurationSeconds: Type.Optional(Type.Union([
    Type.Literal(60), Type.Literal(120), Type.Literal(180), Type.Literal(300), Type.Null()
  ]))
}, { additionalProperties: false });

export const VoteBodySchema = Type.Object({ value: Type.String({ minLength: 1, maxLength: 16 }) }, { additionalProperties: false });
export const FinalizeBodySchema = Type.Object({ finalValue: Type.String({ minLength: 1, maxLength: 32 }) }, { additionalProperties: false });
export const TimerBodySchema = Type.Object({
  action: Type.Union([Type.Literal('start'), Type.Literal('pause'), Type.Literal('resume'), Type.Literal('reset')]),
  durationSeconds: Type.Optional(Type.Union([
    Type.Literal(60), Type.Literal(120), Type.Literal(180), Type.Literal(300)
  ]))
}, { additionalProperties: false });
