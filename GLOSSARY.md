# Scouting

Team 578's tool for collecting scouting observations about other FRC robots at events, so the strategy lead and drive team can plan matches and alliance selection.

## People

**Scout**:
A student who watches robots and records observations.
_Avoid_: Scouter, team member, user

**PIN**:
A Scout's personal 4-digit code, assigned by an Admin, that proves who is logged in.

**Admin**:
A mentor or student lead who sets up the season, the events and the Scouts.

**Strategist**:
A strategy lead or drive coach who reads the scouting data to plan matches and alliance selection.
_Avoid_: Analyst, drive team (as a role name)

## FRC

**Event**:
One FRC competition that Team 578 scouts, such as a regional, district or off-season event.
_Avoid_: Competition, tournament

**Event key**:
The Blue Alliance's identifier for an Event: the year then a short code, such as 2026nyro.
_Avoid_: Event code, event ID

**Team**:
An FRC team, identified by its team number.
_Avoid_: frc578 (that is a TBA key, not a name)

**Robot**:
The physical machine a Team brings to an Event.

**Station**:
One of the six driver station positions in a match: Red 1–3 or Blue 1–3.
_Avoid_: Robot (for the position), alliance team, slot

## Scouting

**Match Scouting**:
Observing one robot through one match.

**Pit Scouting**:
Interviewing a team and inspecting its robot in the pits, once per event.

**Match Report**:
One Scout's record of one robot in one match.
_Avoid_: Session, entry, row

**Match Stage**:
One of the five sequential parts of a match: Pre-Match, Autonomous, Teleop, Endgame, Post-Match.
_Avoid_: Phase, period, section

**Pit Report**:
One Scout's record of one team at one event.
_Avoid_: Session, entry, row

**Draft**:
A Report that a Scout is still filling in. It never leaves the device.

**Complete**:
A Report with every required question answered, ready to Upload.
_Avoid_: Finished, submitted, saved

**Void**:
A Report marked as wrong, for example scouted on the wrong team. It is kept for history but ignored in analysis.
_Avoid_: Delete

## Moving data

**Upload**:
Sending Reports from a device to the team's shared spreadsheet.
_Avoid_: Sync, push, flush

**Hub**:
A device that collects Reports from Scouts by QR code and Uploads them on their behalf.
_Avoid_: Scanner station

**Handed off**:
A Report a Scout has given to a Hub by QR code. The Hub Uploads it, so it no longer waits on the Scout's device.
_Avoid_: Transferred, sent, synced

**Season Config**:
The set of questions Scouts answer for one season's game. It is versioned, and every Report records the version it was answered with.
_Avoid_: Form, question set, config_data

**Season Sheet**:
The team's spreadsheet for one season. It holds the Scout roster, the PINs and the list of events.

**Event Sheet**:
The spreadsheet for one event. It holds that event's schedule and every Report Uploaded for it.
_Avoid_: Scouting template, workbook

**Event Bundle**:
The match schedule and Scout roster for one event, downloaded to a device so it can scout offline.
_Avoid_: Schedule file, match.js

**Coverage**:
Which Stations in which matches have at least one Match Report.
_Avoid_: Progress, scouted status

## Alliance Selection

**Rankings**:
The official order of Teams after the qualification matches, which decides the Alliance Captains.
_Avoid_: Using "ranking" for the Pick List

**Alliance Selection**:
The draft after the qualification matches, in which Alliance Captains pick partners to form the playoff Alliances.
_Avoid_: Draft day, picking

**Alliance Captain**:
One of the top-ranked Teams, usually eight, who picks partners for their Alliance.
_Avoid_: Captain team, seed (as a role name)

**Alliance**:
The Teams that play the playoffs together: an Alliance Captain and the Teams they picked.
_Avoid_: Alliance team (for a Station), playoff team

**Pick List**:
Team 578's ordered list of the Teams it would most want as Alliance partners, built by Strategists before Alliance Selection.
_Avoid_: Ranking, draft board, pick sheet

**Do Not Pick**:
A Team on the Pick List marked as one Team 578 doesn't want as a partner.
_Avoid_: Blacklist, DNP

**Picked**:
A Team that has joined an Alliance during Alliance Selection, so it is no longer available to any other Alliance.
_Avoid_: Taken, gone, drafted

**Declined**:
A Team that turned down an Alliance Captain's invitation during Alliance Selection, so no Alliance can pick it afterwards.
_Avoid_: Refused, rejected
