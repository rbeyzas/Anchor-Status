#![cfg(test)]
//! Property test for the paged anchor index (SOW deliverable 2): after any
//! sequence of registrations and removals, the index holds exactly the
//! registered anchors, each once, with no gap, whatever the page size.
extern crate std;

use proptest::prelude::*;
use soroban_sdk::{testutils::{Address as _, EnvTestConfig}, Address, Env, String, Symbol};
use std::collections::BTreeSet;
use std::format;
use std::vec::Vec as StdVec;

use crate::{AnchorRegistry, AnchorRegistryClient, Error, SourceType, MAX_PAGE};

#[derive(Clone, Debug)]
enum Op {
    Register(u8),
    Remove(u8),
}

fn op() -> impl Strategy<Value = Op> {
    prop_oneof![(0..16u8).prop_map(Op::Register), (0..16u8).prop_map(Op::Remove)]
}

fn id(env: &Env, k: u8) -> Symbol {
    Symbol::new(env, &format!("anchor_{k}"))
}

/// Every id the index lists, read in pages of `page`.
fn listed(client: &AnchorRegistryClient<'_>, page: u32) -> StdVec<Symbol> {
    let count = client.anchor_count();
    let mut out = StdVec::new();
    let mut start = 0;
    while start < count {
        let got = client.list_anchors_page(&start, &page);
        assert!(!got.is_empty(), "an empty page before the end: a gap at {start}");
        out.extend(got.iter());
        start += got.len();
    }
    out
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(1_000))]

    #[test]
    fn the_index_holds_each_registered_anchor_once(ops in prop::collection::vec(op(), 1..40), page in 1..=MAX_PAGE) {
        // A snapshot file per case would bury the repository; these runs are
        // checked by their assertions, not by snapshots.
        let env = Env::new_with_config(EnvTestConfig { capture_snapshot_at_drop: false });
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let client = AnchorRegistryClient::new(&env, &env.register(AnchorRegistry, ()));
        client.init(&admin, &Address::generate(&env), &token);
        let operator = Address::generate(&env);

        let mut model = BTreeSet::new();
        for op in ops {
            match op {
                Op::Register(k) => {
                    let r = client.try_register_anchor(
                        &operator,
                        &id(&env, k),
                        &String::from_str(&env, "a"),
                        &String::from_str(&env, "a.example"),
                        &SourceType::RealMainnet,
                    );
                    if model.insert(k) {
                        prop_assert!(r.is_ok());
                    } else {
                        prop_assert_eq!(r, Err(Ok(Error::AnchorAlreadyExists)));
                    }
                }
                Op::Remove(k) => {
                    if model.remove(&k) {
                        client.deactivate_anchor(&id(&env, k), &String::from_str(&env, "test"));
                        client.remove_anchor(&id(&env, k));
                        prop_assert_eq!(client.try_get_anchor_info(&id(&env, k)), Err(Ok(Error::AnchorNotFound)));
                    } else {
                        prop_assert_eq!(client.try_remove_anchor(&id(&env, k)), Err(Ok(Error::AnchorNotFound)));
                    }
                }
            }

            prop_assert_eq!(client.anchor_count(), model.len() as u32);
            let ids = listed(&client, page);
            let unique: BTreeSet<Symbol> = ids.iter().cloned().collect();
            prop_assert_eq!(unique.len(), ids.len(), "a duplicate in the index");
            let expected: BTreeSet<Symbol> = model.iter().map(|k| id(&env, *k)).collect();
            prop_assert_eq!(unique, expected);
        }
    }
}
