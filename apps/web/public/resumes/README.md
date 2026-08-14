# Resume PDFs

This folder backs the **Resume Variants** download cards on the hidden
portfolio page at `/portfolio` (alias `/john`). The three filenames
below are wired into the page component and into `portfolio-content.ts`
— **do not rename them**, just overwrite the file contents with the
real PDF when you're ready.

| Card on `/portfolio`                          | File to overwrite                              |
| --------------------------------------------- | ---------------------------------------------- |
| Infrastructure & MSP Operations Engineer      | `Infrastructure_MSP_Engineer_Resume.pdf`       |
| Security Operations & Automation Engineer     | `Security_Automation_Engineer_Resume.pdf`      |
| Cloud Infrastructure & Solutions Architect    | `Cloud_Solutions_Architect_Resume.pdf`         |

## How to update

1. Drop the new PDF into this folder, replacing the placeholder file of
   the same name.
2. That's it — Next.js serves `apps/web/public/` directly, so the
   refreshed PDF is live on the next request. No rebuild required.

## What ships today

The three files currently in this folder are minimal valid stub PDFs.
They open in any PDF viewer and show a single placeholder page, so the
download buttons on `/portfolio` always serve a real file instead of a
404. Replace them whenever the real resumes are ready.
