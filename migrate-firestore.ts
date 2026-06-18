import { readFileSync } from "fs";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, writeBatch, getDoc } from "firebase/firestore";

// Read config
const configPath = './firebase-applet-config.json';
const activeConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

console.log("-----------------------------------------");
console.log("🔥 FIREBASE FIRESTORE DATA MIGRATOR 🔥");
console.log("-----------------------------------------");
console.log(`Project ID: ${activeConfig.projectId}`);
console.log(`Source DB:  ai-studio-e3886ee2-0cd5-417d-87a7-488d7f4d6948`);
console.log(`Target DB:  (default)`);
console.log("-----------------------------------------\n");

async function migrate() {
  // Initialize Source App
  const sourceApp = initializeApp(activeConfig, "sourceMigrationApp");
  const sourceDb = getFirestore(sourceApp, "ai-studio-e3886ee2-0cd5-417d-87a7-488d7f4d6948");

  // Initialize Target App
  const targetApp = initializeApp(activeConfig, "targetMigrationApp");
  const targetDb = getFirestore(targetApp, "(default)");

  const collections = ["students", "students_chunks"];

  for (const collName of collections) {
    console.log(`Reading documents from original collection: "${collName}"...`);
    try {
      const snapshot = await getDocs(collection(sourceDb, collName));
      console.log(`Found ${snapshot.size} documents in "${collName}".`);
      
      if (snapshot.size === 0) {
        console.log(`Skipping write for "${collName}".`);
        continue;
      }

      console.log(`Writing to target collection "${collName}"...`);
      let batch = writeBatch(targetDb);
      let count = 0;
      let batchCount = 1;

      for (const document of snapshot.docs) {
        const docData = document.data();
        const targetDocRef = doc(targetDb, collName, document.id);
        batch.set(targetDocRef, docData);
        count++;

        // Firestore batch limit is 500 writes
        if (count % 400 === 0) {
          console.log(`Committing batch ${batchCount} (${count} writes)...`);
          await batch.commit();
          batch = writeBatch(targetDb);
          batchCount++;
        }
      }

      if (count % 400 !== 0) {
        console.log(`Committing final batch ${batchCount}...`);
        await batch.commit();
      }
      console.log(`✅ Successfully migrated ${count} documents for "${collName}".\n`);
    } catch (err: any) {
      console.error(`❌ Error migrating "${collName}":`, err.message);
    }
  }

  // Migrate coaching/current
  console.log('Migrating "coaching/current" state document...');
  try {
    const coachingDocRef = doc(sourceDb, "coaching", "current");
    const coachingSnap = await getDoc(coachingDocRef);
    if (coachingSnap.exists()) {
      const data = coachingSnap.data();
      await setDoc(doc(targetDb, "coaching", "current"), data);
      console.log("✅ Successfully migrated coaching state.");
    } else {
      console.log("No coaching state document found.");
    }
  } catch (err: any) {
    console.error("❌ Error migrating coaching/current document:", err.message);
  }

  console.log("\n⭐ Migration finished! Cleanup resources...");
  await deleteApp(sourceApp);
  await deleteApp(targetApp);
  console.log("Done!");
}

migrate();
