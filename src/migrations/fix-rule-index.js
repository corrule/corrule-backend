/**
 * Migration Script: Fix Rule Query Unique Index
 * 
 * This script updates the MongoDB indexes for the Rule collection:
 * - Removes the old global unique index on ruleContent.query
 * - Adds a new conditional unique index that only applies to APPROVED/UNDER_REVIEW rules
 * - This allows DRAFT rules to have duplicate queries (for forking)
 * - Published rules still have unique query constraints
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const Rule = require('../models/Rule');

async function migrateIndexes() {
  try {
    console.log('🔄 Starting index migration...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    // Drop old index if it exists
    try {
      await Rule.collection.dropIndex('ruleContent.query_1');
      console.log('✅ Dropped old unique index on ruleContent.query');
    } catch (err) {
      if (err.code === 27) {
        console.log('ℹ️  Old index does not exist (this is fine)');
      } else {
        throw err;
      }
    }

    // Drop the compound index that might exist
    try {
      await Rule.collection.dropIndex('ruleContent.query_1_status_1');
      console.log('✅ Dropped old compound index on ruleContent.query and status');
    } catch (err) {
      if (err.code === 27) {
        console.log('ℹ️  Old compound index does not exist (this is fine)');
      } else {
        throw err;
      }
    }

    // Recreate indexes using the model (which has the updated index definitions)
    // Note: We don't drop ALL indexes since _id_ is required
    // Just sync the indexes based on the schema definition
    
    // Recreate all indexes
    await Rule.syncIndexes();
    console.log('✅ Recreated all indexes');

    // Verify the indexes
    const indexes = await Rule.collection.getIndexes();
    console.log('\n📋 Current indexes:');
    Object.entries(indexes).forEach(([name, spec]) => {
      console.log(`  - ${name}:`, JSON.stringify(spec));
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('\n✨ Changes:');
    console.log('  - DRAFT rules can now be forked with duplicate queries');
    console.log('  - Published rules (APPROVED/UNDER_REVIEW) still require unique queries');
    console.log('  - Title uniqueness is still enforced globally');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateIndexes();
