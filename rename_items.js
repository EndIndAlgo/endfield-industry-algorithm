const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'src/assets/items');

fs.readdir(targetDir, (err, files) => {
    if (err) {
        console.error('Could not list the directory.', err);
        process.exit(1);
    }

    // Filter for files only (optional, based on my check found only files)
    // and sort them to have a deterministic order
    const filesToRename = files.filter(file => {
        const filePath = path.join(targetDir, file);
        return fs.statSync(filePath).isFile();
    }).sort(); // Default string sort

    let counter = 0;
    filesToRename.forEach((file) => {
        const ext = path.extname(file);
        const newName = `item_${counter}${ext}`;
        const oldPath = path.join(targetDir, file);
        const newPath = path.join(targetDir, newName);

        // Avoid renaming if the name is already correct to prevent errors or redundant ops
        if (file !== newName) {
             // Check if target exists (in case of collision, though unlikely with sequential renaming from scratch unless overwrite)
             // We just overwrite or simpler: just rename.
             // If we have item_0.webp and we want to rename item_something.webp to item_0.webp, and we are iterating...
             // If the list includes item_0.webp already, we might overwrite it if we are not careful.
             // But here we are renaming *everything*.
             // Safest is to rename to a temporary name first or check for collisions.
             // Given the current names (item_carbon...) do not conflict with item_0...item_124, we are fine.
             // BUT if I run this script TWICE, the files will be item_0...item_124.
             // Sorting them: item_0, item_1, item_10...
             // Renaming item_0 to item_0 -> no op.
             // Renaming item_1 to item_1 -> no op.
             // Renaming item_10 to item_2 (because item_10 is the 3rd or so file alphabetically?) -> CONFLICT if item_2 exists.
             
             // To handle potential conflicts (e.g. running on already renamed files or mixed):
             // Strategy: Rename everything to a UUID temporary name first, then rename to final names.
             
             // However, for this specific request, the user likely has the original 'item_carbon...' names.
             // I'll implement the UUID strategy to be safe and robust.
             
             // Actually, simplest 'safe' way for a "write a program" request helps the user manually too.
             // I'll stick to direct rename but warn if distinct inputs map to same output (not possible here).
             // To avoid collisions during the process (e.g. renaming A to B, but B exists and will be renamed to C later),
             // I will use a two-pass approach:
             // 1. Rename all to slightly modified names (e.g. prefix 'temp_').
             // 2. Rename all 'temp_' to final names.
        }
    });

    // Let's do the two-pass approach to be safe against existing item_N names.
    console.log(`Found ${filesToRename.length} files. Starting rename process...`);
    
    // Pass 1: Rename to temp
    filesToRename.forEach((file, index) => {
        const ext = path.extname(file);
        const tempName = `temp_rename_${index}${ext}`;
        fs.renameSync(path.join(targetDir, file), path.join(targetDir, tempName));
    });

    // Pass 2: Rename to final
    filesToRename.forEach((_, index) => {
         // We need to match the ext from the sorted list.
         // Wait, filesToRename[index] holds the original name.
         const originalName = filesToRename[index];
         const ext = path.extname(originalName);
         const tempName = `temp_rename_${index}${ext}`;
         const finalName = `item_${index}${ext}`;
         
         fs.renameSync(path.join(targetDir, tempName), path.join(targetDir, finalName));
         console.log(`Renamed ${originalName} -> ${finalName}`);
    });
    
    console.log('All done!');
});
