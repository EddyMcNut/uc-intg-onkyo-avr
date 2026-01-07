/**
 * Entity Migration Test Helper
 * 
 * This file provides test utilities to verify the EntityMigration class works correctly.
 * Run this to test migration before integrating into the main driver.
 */

import { EntityMigration } from "../src/entityMigration.js";
import * as uc from "@unfoldedcircle/integration-api";
import { OnkyoConfig } from "../src/configManager.js";

/**
 * Test scenario 1: Single AVR upgrade from old format
 */
function testSingleAvrMigration() {
  console.log("\n=== Test 1: Single AVR Migration ===");
  
  const mockDriver = new uc.IntegrationAPI();
  
  const config: OnkyoConfig = {
    avrs: [
      {
        model: "TX-RZ50",
        ip: "192.168.2.103",
        port: 60128,
        zone: "main",
        queueThreshold: 100,
        albumArtURL: "album_art.cgi",
        volumeScale: 100,
        adjustVolumeDispl: true
      }
    ]
  };

  const migration = new EntityMigration(mockDriver, config);
  
  console.log("Mappings created:");
  const mappings = migration.getMappings();
  mappings.forEach(m => {
    console.log(`  ${m.oldEntityId} -> ${m.newEntityId}`);
  });
  
  console.log("\nExpected mapping:");
  console.log("  TX-RZ50 192.168.2.103 -> TX-RZ50 192.168.2.103 main");
  
  const expectedOld = "TX-RZ50 192.168.2.103";
  const expectedNew = "TX-RZ50 192.168.2.103 main";
  
  const actualNew = migration.getNewEntityId(expectedOld);
  const actualOld = migration.getOldEntityId(expectedNew);
  
  console.log(`\nVerification:`);
  console.log(`  Old -> New: ${expectedOld} -> ${actualNew}`);
  console.log(`  New -> Old: ${expectedNew} -> ${actualOld}`);
  console.log(`  Test ${actualNew === expectedNew ? '✓ PASSED' : '✗ FAILED'}`);
}

/**
 * Test scenario 2: Multi-zone AVR
 */
function testMultiZoneMigration() {
  console.log("\n=== Test 2: Multi-Zone Migration ===");
  
  const mockDriver = new uc.IntegrationAPI();
  
  const config: OnkyoConfig = {
    avrs: [
      {
        model: "TX-NR696",
        ip: "192.168.1.50",
        port: 60128,
        zone: "main",
        queueThreshold: 100,
        albumArtURL: "album_art.cgi",
        volumeScale: 100,
        adjustVolumeDispl: true
      },
      {
        model: "TX-NR696",
        ip: "192.168.1.50",
        port: 60128,
        zone: "zone2",
        queueThreshold: 100,
        albumArtURL: "album_art.cgi",
        volumeScale: 100,
        adjustVolumeDispl: true
      },
      {
        model: "TX-NR696",
        ip: "192.168.1.50",
        port: 60128,
        zone: "zone3",
        queueThreshold: 100,
        albumArtURL: "album_art.cgi",
        volumeScale: 100,
        adjustVolumeDispl: true
      }
    ]
  };

  const migration = new EntityMigration(mockDriver, config);
  
  console.log("Mappings created:");
  const mappings = migration.getMappings();
  mappings.forEach(m => {
    console.log(`  ${m.oldEntityId} -> ${m.newEntityId}`);
  });
  
  console.log("\nExpected: Only one mapping (old format -> main zone)");
  console.log("  TX-NR696 192.168.1.50 -> TX-NR696 192.168.1.50 main");
  
  const expectedOld = "TX-NR696 192.168.1.50";
  const expectedNew = "TX-NR696 192.168.1.50 main";
  
  const actualNew = migration.getNewEntityId(expectedOld);
  
  console.log(`\nVerification:`);
  console.log(`  Mappings count: ${mappings.length} (expected: 1)`);
  console.log(`  Old -> New: ${expectedOld} -> ${actualNew}`);
  console.log(`  Test ${mappings.length === 1 && actualNew === expectedNew ? '✓ PASSED' : '✗ FAILED'}`);
}

/**
 * Test scenario 3: Multiple different AVRs
 */
function testMultipleAvrsMigration() {
  console.log("\n=== Test 3: Multiple Different AVRs ===");
  
  const mockDriver = new uc.IntegrationAPI();
  
  const config: OnkyoConfig = {
    avrs: [
      {
        model: "TX-RZ50",
        ip: "192.168.2.103",
        port: 60128,
        zone: "main",
        queueThreshold: 100,
        albumArtURL: "album_art.cgi",
        volumeScale: 100,
        adjustVolumeDispl: true
      },
      {
        model: "TX-NR696",
        ip: "192.168.1.50",
        port: 60128,
        zone: "main",
        queueThreshold: 100,
        albumArtURL: "album_art.cgi",
        volumeScale: 100,
        adjustVolumeDispl: true
      },
      {
        model: "TX-NR696",
        ip: "192.168.1.50",
        port: 60128,
        zone: "zone2",
        queueThreshold: 100,
        albumArtURL: "album_art.cgi",
        volumeScale: 100,
        adjustVolumeDispl: true
      }
    ]
  };

  const migration = new EntityMigration(mockDriver, config);
  
  console.log("Mappings created:");
  const mappings = migration.getMappings();
  mappings.forEach(m => {
    console.log(`  ${m.oldEntityId} -> ${m.newEntityId}`);
  });
  
  console.log("\nExpected: Two mappings");
  console.log("  TX-RZ50 192.168.2.103 -> TX-RZ50 192.168.2.103 main");
  console.log("  TX-NR696 192.168.1.50 -> TX-NR696 192.168.1.50 main");
  
  console.log(`\nVerification:`);
  console.log(`  Mappings count: ${mappings.length} (expected: 2)`);
  console.log(`  Test ${mappings.length === 2 ? '✓ PASSED' : '✗ FAILED'}`);
}

/**
 * Test scenario 4: No AVRs configured
 */
function testNoAvrsMigration() {
  console.log("\n=== Test 4: No AVRs Configured ===");
  
  const mockDriver = new uc.IntegrationAPI();
  
  const config: OnkyoConfig = {
    avrs: []
  };

  const migration = new EntityMigration(mockDriver, config);
  
  const mappings = migration.getMappings();
  const needsMigration = migration.needsMigration();
  
  console.log(`Mappings count: ${mappings.length}`);
  console.log(`Needs migration: ${needsMigration}`);
  console.log(`Test ${mappings.length === 0 && !needsMigration ? '✓ PASSED' : '✗ FAILED'}`);
}

/**
 * Test scenario 5: Format checking
 */
function testFormatChecking() {
  console.log("\n=== Test 5: Format Checking ===");
  
  const mockDriver = new uc.IntegrationAPI();
  
  const config: OnkyoConfig = {
    avrs: [
      {
        model: "TX-RZ50",
        ip: "192.168.2.103",
        port: 60128,
        zone: "main",
        queueThreshold: 100,
        albumArtURL: "album_art.cgi",
        volumeScale: 100,
        adjustVolumeDispl: true
      }
    ]
  };

  const migration = new EntityMigration(mockDriver, config);
  
  const oldId = "TX-RZ50 192.168.2.103";
  const newId = "TX-RZ50 192.168.2.103 main";
  const randomId = "Some-Other-Entity";
  
  console.log(`Is "${oldId}" old format? ${migration.isOldFormat(oldId)}`);
  console.log(`Is "${newId}" new format? ${migration.isNewFormat(newId)}`);
  console.log(`Is "${randomId}" old format? ${migration.isOldFormat(randomId)}`);
  console.log(`Is "${randomId}" new format? ${migration.isNewFormat(randomId)}`);
  
  const test1 = migration.isOldFormat(oldId) === true;
  const test2 = migration.isNewFormat(newId) === true;
  const test3 = migration.isOldFormat(randomId) === false;
  const test4 = migration.isNewFormat(randomId) === false;
  
  console.log(`Test ${test1 && test2 && test3 && test4 ? '✓ PASSED' : '✗ FAILED'}`);
}

/**
 * Run all tests
 */
function runAllTests() {
  console.log("================================");
  console.log("Entity Migration Test Suite");
  console.log("================================");
  
  testSingleAvrMigration();
  testMultiZoneMigration();
  testMultipleAvrsMigration();
  testNoAvrsMigration();
  testFormatChecking();
  
  console.log("\n================================");
  console.log("All tests completed");
  console.log("================================\n");
}

// Export for use in test files
export {
  testSingleAvrMigration,
  testMultiZoneMigration,
  testMultipleAvrsMigration,
  testNoAvrsMigration,
  testFormatChecking,
  runAllTests
};

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}
