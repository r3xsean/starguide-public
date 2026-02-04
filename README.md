# StarGuide

A team builder for Honkai: Star Rail that helps players build optimal teams using curated character data and intelligent team recommendations.

**[Launch StarGuide](https://starguide-bay.vercel.app/)**

## Features

### Team Building
- **Teammate Recommendations** - See the best teammates for any character, rated S/A/B/C/D with explanations
- **Bidirectional Scoring** - Teams are scored by mutual synergy (DPS wants the support AND support wants the DPS)
- **Composition Awareness** - Recommendations adjust based on team archetype (Hypercarry, DoT, Break, etc.)

### Roster Management
- **Track Your Characters** - Mark which characters you own
- **Cloud Sync** - Sign in to sync your roster across devices
- **Investment Tracking** - Track eidolons and light cones for accurate recommendations

### Smart Recommendations
- **Best Teams** - Auto-generate optimal teams from your owned roster
- **Pull Advisor** - See which characters would improve your account the most
- **Banner Advisor** - Evaluate current/upcoming banners based on your roster

### Game Modes
- Memory of Chaos (MoC)
- Pure Fiction (PF)
- Apocalyptic Shadow (AS)

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Vite
- **Styling:** Tailwind CSS v4
- **Backend:** Supabase (auth, cloud sync)
- **Deployment:** Vercel

## Contributing

This is the public mirror of the StarGuide repository. Character data and admin tools are maintained in a private repository.

If you find issues with character recommendations or want to suggest improvements, use the in-app feedback widget or open an issue.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE). Honkai: Star Rail is a trademark of HoYoverse/miHoYo.
